/**
 * EventRepository.ts
 *
 * Manages PostgreSQL persistence for decoded and validated Soroban contract
 * events. All database interaction is isolated to this module — decoding and
 * validation logic lives in EventDecoderService and EventValidationService.
 *
 * Implements issue #1245: Decouple event decoding logic from database
 * persistence transactions.
 */

import type { Pool, PoolClient } from "pg";
import type { DecodedContractEvent } from "./EventDecoderService.js";
import type { DecodeError } from "./EventDecoderService.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PersistResult {
  inserted: number;
  skipped: number;
}

export interface QuarantineEntry {
  contractId: string;
  eventId: string;
  rawXdr: string;
  reason: string;
}

// ─── SQL constants ────────────────────────────────────────────────────────────

const UPSERT_EVENT_SQL = `
  INSERT INTO contract_events (
    id,
    contract_id,
    ledger_seq,
    ledger_closed_at,
    tx_hash,
    event_index,
    event_name,
    topics,
    data,
    raw_xdr,
    org_id,
    created_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  ON CONFLICT (ledger_seq, tx_hash, event_index) DO NOTHING
  RETURNING id
`;

const INSERT_QUARANTINE_SQL = `
  INSERT INTO indexer_quarantine (contract_id, event_id, raw_event, reason, created_at)
  VALUES ($1, $2, $3::jsonb, $4, NOW())
  ON CONFLICT (contract_id, event_id) DO NOTHING
`;

// ─── Repository ───────────────────────────────────────────────────────────────

export class EventRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Persist a batch of decoded, validated contract events in a single
   * transaction. Events already present (same ledger_seq / tx_hash /
   * event_index) are silently skipped via ON CONFLICT DO NOTHING.
   *
   * @param events - Decoded events to persist
   * @returns      - Count of rows actually inserted vs skipped duplicates
   */
  async persistEvents(events: DecodedContractEvent[]): Promise<PersistResult> {
    if (events.length === 0) {
      return { inserted: 0, skipped: 0 };
    }

    const client: PoolClient = await this.pool.connect();
    let inserted = 0;

    try {
      await client.query("BEGIN");

      for (const event of events) {
        const result = await client.query(UPSERT_EVENT_SQL, [
          event.id,
          event.contractId,
          event.ledger,
          event.ledgerClosedAt,
          event.txHash,
          event.eventIndex,
          event.eventName,
          JSON.stringify(event.topics),
          event.data !== null ? JSON.stringify(event.data) : null,
          event.rawXdr,
          // org_id is derived from contractId — the first segment before "."
          // or the full value when no dot separator is present.
          event.contractId.split(".")[0] ?? event.contractId,
          new Date(event.ledgerClosedAt),
        ]);

        if (result.rowCount && result.rowCount > 0) {
          inserted++;
        }
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return { inserted, skipped: events.length - inserted };
  }

  /**
   * Quarantine events that failed decoding or validation so they can be
   * inspected and replayed without blocking the rest of the ledger batch.
   *
   * @param failures - Decode errors to quarantine
   */
  async quarantineErrors(failures: DecodeError[]): Promise<void> {
    if (failures.length === 0) return;

    const client: PoolClient = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const failure of failures) {
        await client.query(INSERT_QUARANTINE_SQL, [
          // contractId is not available from a decode error — use a sentinel
          "unknown",
          failure.id,
          JSON.stringify({ id: failure.id, xdr: failure.rawXdr }),
          failure.error,
        ]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Quarantine a decoded event that failed schema/ABI validation.
   */
  async quarantineInvalidEvent(
    event: DecodedContractEvent,
    reason: string,
  ): Promise<void> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query(INSERT_QUARANTINE_SQL, [
        event.contractId,
        event.id,
        JSON.stringify({ id: event.id, eventName: event.eventName, topics: event.topics }),
        reason,
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Return the highest persisted ledger sequence for a given contract, or
   * null when no events have been indexed for it yet.
   */
  async getLatestLedger(contractId: string): Promise<number | null> {
    const result = await this.pool.query<{ ledger_seq: number }>(
      "SELECT MAX(ledger_seq) AS ledger_seq FROM contract_events WHERE contract_id = $1",
      [contractId],
    );
    const row = result.rows[0];
    return row?.ledger_seq ?? null;
  }
}
