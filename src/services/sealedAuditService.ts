/**
 * auditService.ts
 *
 * Append-only audit log with cryptographic hash-chaining.
 *
 * Every row stored in audit_log is linked to the previous row:
 *
 *   entry_hash = SHA-256( previous_hash + event_type + stable_payload + created_at )
 *   signature  = HMAC-SHA-256( entry_hash, AUDIT_SECRET )
 *
 * The first row uses an all-zero genesis hash as "previous_hash".
 *
 * Verification iterates all rows in insertion order, re-derives each
 * entry_hash and signature, and reports any break in the chain or
 * any tampered field.
 */

import { createHash, createHmac } from 'crypto';
import { Pool } from 'pg';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: Date;
  previous_hash: string;
  entry_hash: string;
  signature: string;
}

export interface VerificationResult {
  ok: boolean;
  total: number;
  broken: BrokenLink[];
}

export interface BrokenLink {
  id: number;
  reason: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** SHA-256 hex of the empty string — used as the genesis previous_hash. */
export const GENESIS_HASH =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

// ─── Hash helpers ─────────────────────────────────────────────────────────────

/**
 * Produces a deterministic string for the data fields that are covered by the
 * entry hash.  Payload is serialised as a sorted-key JSON string so that
 * field order never affects the digest.
 */
export function buildHashInput(
  previousHash: string,
  eventType: string,
  payload: Record<string, unknown>,
  createdAt: Date,
): string {
  const stablePayload = JSON.stringify(payload, Object.keys(payload).sort());
  return `${previousHash}|${eventType}|${stablePayload}|${createdAt.toISOString()}`;
}

/** SHA-256 hex digest of the concatenated chain fields. */
export function computeEntryHash(
  previousHash: string,
  eventType: string,
  payload: Record<string, unknown>,
  createdAt: Date,
): string {
  const input = buildHashInput(previousHash, eventType, payload, createdAt);
  return createHash('sha256').update(input).digest('hex');
}

/** HMAC-SHA-256 hex over entry_hash, keyed with AUDIT_SECRET. */
export function computeSignature(entryHash: string, secret: string): string {
  return createHmac('sha256', secret).update(entryHash).digest('hex');
}

// ─── Service class ────────────────────────────────────────────────────────────

export class AuditService {
  private readonly pool: Pool;
  private readonly secret: string;

  constructor(pool: Pool, secret?: string) {
    this.pool = pool;
    const s = secret ?? process.env.AUDIT_SECRET;
    if (!s) {
      throw new Error('AUDIT_SECRET environment variable is required');
    }
    this.secret = s;
  }

  /**
   * Appends a new entry to the audit log.
   *
   * The method fetches the most-recent entry_hash under a row-level lock,
   * derives the new hashes, and inserts the row — all within a single
   * transaction so concurrent writers never produce a fork in the chain.
   */
  async append(
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<AuditEntry> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Fetch the last entry_hash with a FOR UPDATE lock to prevent races.
      const prevResult = await client.query<{ entry_hash: string }>(
        `SELECT entry_hash FROM audit_log ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      );
      const previousHash =
        prevResult.rows.length > 0
          ? prevResult.rows[0].entry_hash
          : GENESIS_HASH;

      // Use the DB server's clock so the timestamp is authoritative.
      const tsResult = await client.query<{ now: Date }>(
        `SELECT NOW() AS now`,
      );
      const createdAt: Date = tsResult.rows[0].now;

      const entryHash = computeEntryHash(
        previousHash,
        eventType,
        payload,
        createdAt,
      );
      const signature = computeSignature(entryHash, this.secret);

      const insertResult = await client.query<AuditEntry>(
        `INSERT INTO audit_log
           (event_type, payload, created_at, previous_hash, entry_hash, signature)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, event_type, payload, created_at, previous_hash, entry_hash, signature`,
        [
          eventType,
          JSON.stringify(payload),
          createdAt,
          previousHash,
          entryHash,
          signature,
        ],
      );

      await client.query('COMMIT');
      return insertResult.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Reads all audit entries in insertion order.
   * Useful for read-only inspection; verification is handled by verify().
   */
  async listAll(): Promise<AuditEntry[]> {
    const result = await this.pool.query<AuditEntry>(
      `SELECT id, event_type, payload, created_at,
              previous_hash, entry_hash, signature
       FROM audit_log
       ORDER BY id ASC`,
    );
    return result.rows;
  }

  /**
   * Iterates all entries in order and re-derives every hash and signature.
   *
   * Returns:
   *   ok      — true only when every entry passes both checks.
   *   total   — total number of entries inspected.
   *   broken  — list of entries that failed with a human-readable reason.
   */
  async verify(): Promise<VerificationResult> {
    const entries = await this.listAll();
    const broken: BrokenLink[] = [];
    let expectedPrevious = GENESIS_HASH;

    for (const entry of entries) {
      // 1. The stored previous_hash must match what we expect.
      if (entry.previous_hash !== expectedPrevious) {
        broken.push({
          id: entry.id,
          reason: `previous_hash mismatch: expected ${expectedPrevious}, got ${entry.previous_hash}`,
        });
        // Update expectedPrevious to the stored value so we continue
        // detecting further breaks rather than cascading a single error.
        expectedPrevious = entry.entry_hash;
        continue;
      }

      // 2. Re-derive the entry_hash and compare.
      const derived = computeEntryHash(
        entry.previous_hash,
        entry.event_type,
        entry.payload,
        new Date(entry.created_at),
      );
      if (derived !== entry.entry_hash) {
        broken.push({
          id: entry.id,
          reason: `entry_hash mismatch: data has been tampered`,
        });
        expectedPrevious = entry.entry_hash;
        continue;
      }

      // 3. Re-derive the signature and compare.
      const derivedSig = computeSignature(entry.entry_hash, this.secret);
      if (derivedSig !== entry.signature) {
        broken.push({
          id: entry.id,
          reason: `signature mismatch: HMAC verification failed`,
        });
      }

      expectedPrevious = entry.entry_hash;
    }

    return {
      ok: broken.length === 0,
      total: entries.length,
      broken,
    };
  }
}
