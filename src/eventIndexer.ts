/**
 * eventIndexer.ts
 *
 * Polls the Soroban RPC node every 5 seconds for WorkloadGovernor contract events,
 * parses them into typed DB records, and persists them with deduplication.
 *
 * Supported event types (matching src/events.rs emit helpers):
 *   applied, withdrew, assigned, completed, revoked, maint_reg
 *
 * ## 3-element topic schema (#829 SC-004)
 *
 * All contract events now emit a standardised 3-element topic tuple:
 *   topics[0]  Symbol("WG")          — contract namespace discriminant
 *   topics[1]  Symbol(<event_name>)  — operation identifier
 *   topics[2]  Address               — primary entity (contributor or admin)
 *
 * The indexer filters on topics[0] == "WG" to efficiently locate WorkloadGovernor
 * events without wildcard scans, and reads the event type from topics[1].
 *
 * Deduplication key: (ledger_sequence, transaction_hash, event_index) —
 *   INSERT … ON CONFLICT DO NOTHING prevents duplicate rows even after a
 *   full-history replay caused by cursor loss (fixes issue #575).
 *
 * Reorg / Fork Rollback Handling (#1022):
 *   Verifies ledger continuity by comparing the parent hash (prevHash) of the
 *   incoming ledger against the previous checkpoint hash. When a Horizon
 *   ledger reorganization or rollback is detected, rewinds checkpoint state
 *   and deletes orphaned events back to the last confirmed common ancestor.
 */

import { SorobanRpc } from '@stellar/stellar-sdk';
import { EventValidationError, validateContractEvent } from './contractEventSchema';
import { pool, getCheckpoint, saveCheckpoint, IndexerCheckpoint } from './db';
import { logger } from './logger';
import { publishLiveEvent } from './services/event-bus';
import { getCache, setCache } from './services/redis';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CONTRACT_ID =
  process.env['CONTRACT_ID'] ??
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

const RPC_URL =
  process.env['SOROBAN_RPC_URL'] ?? 'https://soroban-testnet.stellar.org';

const POLL_INTERVAL_MS = 5_000;
const ERROR_BACKOFF_MS = 10_000;

// ---------------------------------------------------------------------------
// Event & Ledger types
// ---------------------------------------------------------------------------

export type ContractEventType =
  | 'applied'
  | 'withdrew'
  | 'assigned'
  | 'completed'
  | 'revoked'
  | 'maint_reg';

/**
 * Normalized DB record for a single contract event.
 * Stored in the `contract_events` table.
 */
export interface ContractEventRecord {
  event_type: ContractEventType;
  contributor: string | null;
  org_id: string | null;
  issue_id: number | null;
  tx_hash: string;
  event_index: number;
  ledger: number;
  timestamp: Date;
}

/**
 * Ledger header metadata used to verify chain continuity and detect forks (#1022).
 */
export interface LedgerHeaderInfo {
  sequence: number;
  hash: string;
  prevHash: string | null;
}

export type LedgerProvider = (sequence: number) => Promise<LedgerHeaderInfo | null>;

// ---------------------------------------------------------------------------
// RPC event shape (SDK v12, raw RPC, and legacy wrappers)
// ---------------------------------------------------------------------------

interface RpcEvent {
  /** "contract" | "system" | "diagnostic" */
  type: string;
  /** "<ledger>-<tx_index>-<event_index>" — paging cursor */
  id: string;
  pagingToken: string;
  /** SDK returns a number; legacy streams may use a string. */
  ledger: string | number;
  /** optional ledger hash and parent hash reported by stream / Horizon */
  ledgerHash?: string;
  prevLedgerHash?: string;
  /** ISO-8601 creation timestamp */
  createdAt?: string;
  ledgerClosedAt?: string;
  txHash?: string;
  topic: unknown;
  value: unknown;
}

// ---------------------------------------------------------------------------
// EventIndexer class
// ---------------------------------------------------------------------------

export class EventIndexer {
  private server: SorobanRpc.Server;
  /** Paging cursor for the next RPC call. Undefined means start from resume ledger. */
  private cursor: string | undefined;
  private isRunning = false;
  private lastCheckpointLedger = 0;
  private lastCheckpointHash: string | null = null;
  private lastCheckpointTime = Date.now();
  /** Bounded map of confirmed ledger_sequence -> ledger_hash for ancestor resolution (#1022). */
  private ledgerHashHistory = new Map<number, string>();
  private ledgerProvider?: LedgerProvider;

  constructor(ledgerProvider?: LedgerProvider) {
    this.server = new SorobanRpc.Server(RPC_URL, { allowHttp: true });
    this.ledgerProvider = ledgerProvider;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Resume from the last successfully indexed ledger
    await this.initCursor();

    logger.info({ message: 'Event indexer started', contract: CONTRACT_ID, rpc: RPC_URL });

    this.pollForEvents().catch((err) => {
      logger.error({
        message: 'Event indexer fatal error',
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      this.isRunning = false;
    });
  }

  stop(): void {
    this.isRunning = false;
    logger.info({ message: 'Event indexer stopped' });
  }

  // ── Ledger Continuity & Reorg Handling (#1022) ───────────────────────────

  /**
   * Record a confirmed ledger hash in the local history ring buffer.
   */
  recordLedgerHash(sequence: number, hash: string): void {
    this.ledgerHashHistory.set(sequence, hash);
    if (sequence >= this.lastCheckpointLedger) {
      this.lastCheckpointLedger = sequence;
      this.lastCheckpointHash = hash;
    }
    // Keep at most 1000 recent ledgers in memory
    if (this.ledgerHashHistory.size > 1000) {
      const oldestKey = this.ledgerHashHistory.keys().next().value;
      if (oldestKey !== undefined) {
        this.ledgerHashHistory.delete(oldestKey);
      }
    }
  }

  getRecordedLedgerHash(sequence: number): string | undefined {
    return this.ledgerHashHistory.get(sequence);
  }

  getCheckpointState(): { lastLedger: number; lastLedgerHash: string | null; cursor: string | undefined } {
    return {
      lastLedger: this.lastCheckpointLedger,
      lastLedgerHash: this.lastCheckpointHash,
      cursor: this.cursor,
    };
  }

  /**
   * Compare parent hash of the current ledger with the previous checkpoint hash
   * (or recorded ancestor hash) to detect Horizon ledger reorganizations or rollbacks.
   *
   * @returns true if ledger continuity holds, false if a fork/reorg or rollback is detected.
   */
  verifyLedgerContinuity(
    currentLedger: LedgerHeaderInfo,
    checkpoint?: Pick<IndexerCheckpoint, 'last_ledger' | 'last_ledger_hash'>,
  ): boolean {
    const refLedger = checkpoint?.last_ledger ?? this.lastCheckpointLedger;
    const refHash =
      checkpoint !== undefined ? checkpoint.last_ledger_hash : this.lastCheckpointHash;

    // No prior checkpoint established yet — continuity trivially holds
    if (refLedger <= 0 || !refHash) {
      return true;
    }

    // Rollback detected: incoming ledger sequence regressed behind confirmed checkpoint
    if (currentLedger.sequence < refLedger) {
      const knownAtSeq = this.ledgerHashHistory.get(currentLedger.sequence);
      if (knownAtSeq && knownAtSeq === currentLedger.hash) {
        // Replaying an already-confirmed identical ledger is not a fork,
        // unless Horizon rolled back tip below checkpoint
      }
      return false;
    }

    // Same ledger sequence: hash must match the checkpoint hash
    if (currentLedger.sequence === refLedger) {
      return currentLedger.hash === refHash;
    }

    // Immediate successor ledger: parent hash must equal previous checkpoint hash
    if (currentLedger.sequence === refLedger + 1) {
      return currentLedger.prevHash === refHash;
    }

    // Gap > 1 ledger: if we have the immediate parent in local history, verify against it
    const parentHashInHistory = this.ledgerHashHistory.get(currentLedger.sequence - 1);
    if (parentHashInHistory !== undefined && currentLedger.prevHash !== null) {
      return currentLedger.prevHash === parentHashInHistory;
    }

    return true;
  }

  /**
   * Walk backward from the divergent ledger sequence to locate the last
   * confirmed common ancestor between local history and canonical Horizon chain.
   */
  async findCommonAncestor(
    fromLedger?: number,
    fetchLedger?: LedgerProvider,
  ): Promise<{ sequence: number; hash: string | null }> {
    const provider = fetchLedger ?? this.ledgerProvider;
    const startSeq = Math.min(
      fromLedger ?? this.lastCheckpointLedger,
      this.lastCheckpointLedger,
    );

    if (startSeq <= 0) {
      return { sequence: 0, hash: null };
    }

    for (let seq = startSeq; seq >= 1; seq--) {
      const localHash =
        this.ledgerHashHistory.get(seq) ??
        (seq === this.lastCheckpointLedger ? this.lastCheckpointHash ?? undefined : undefined);

      if (!provider) {
        if (localHash && seq < startSeq) {
          return { sequence: seq, hash: localHash };
        }
        continue;
      }

      const canonical = await provider(seq);
      if (!canonical) {
        continue;
      }

      if (localHash && canonical.hash === localHash) {
        return { sequence: seq, hash: canonical.hash };
      }

      // Also check if canonical.prevHash matches local hash at seq - 1
      const parentLocalHash = this.ledgerHashHistory.get(seq - 1);
      if (parentLocalHash && canonical.prevHash === parentLocalHash) {
        return { sequence: seq - 1, hash: parentLocalHash };
      }
    }

    return { sequence: 0, hash: null };
  }

  /**
   * Rewind persisted and in-memory checkpoint state to the last confirmed
   * common ancestor, purging any invalidated contract events above that ledger.
   */
  async rewindToAncestor(
    ancestorLedger: number,
    ancestorHash: string | null = null,
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Remove events ingested from orphaned fork ledgers
      await client.query(
        'DELETE FROM contract_events WHERE ledger_seq > $1',
        [ancestorLedger],
      );

      // Rewind the persisted checkpoint in indexer_checkpoints
      await saveCheckpoint(CONTRACT_ID, ancestorLedger, ancestorHash, client);

      await client.query('COMMIT');

      // Update Redis checkpoint cache to match rewound state
      try {
        await setCache(`indexer:checkpoint:${CONTRACT_ID}`, ancestorLedger, 3600);
      } catch {
        // Non-fatal cache update error
      }
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({
        message: 'Failed to rewind checkpoint state on reorg',
        ancestorLedger,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      client.release();
    }

    // Prune invalidated entries from in-memory ledger hash history
    for (const seq of Array.from(this.ledgerHashHistory.keys())) {
      if (seq > ancestorLedger) {
        this.ledgerHashHistory.delete(seq);
      }
    }

    if (ancestorLedger > 0 && ancestorHash) {
      this.ledgerHashHistory.set(ancestorLedger, ancestorHash);
    }

    this.lastCheckpointLedger = ancestorLedger;
    this.lastCheckpointHash = ancestorHash;
    this.cursor = ancestorLedger > 0 ? String(ancestorLedger) : undefined;

    logger.warn({
      message: 'Rewound indexer checkpoint to last confirmed common ancestor',
      ancestorLedger,
      ancestorHash,
    });
  }

  /**
   * Verify ledger continuity for an incoming ledger header and automatically
   * rewind checkpoint state to the last confirmed common ancestor if a reorg is detected.
   */
  async handleLedgerContinuity(
    currentLedger: LedgerHeaderInfo,
    fetchLedger?: LedgerProvider,
  ): Promise<{ reorgDetected: boolean; rewoundToLedger?: number }> {
    const isContinuous = this.verifyLedgerContinuity(currentLedger);

    if (!isContinuous) {
      logger.warn({
        message: 'Ledger reorganization or rollback detected',
        currentLedger: currentLedger.sequence,
        currentHash: currentLedger.hash,
        currentPrevHash: currentLedger.prevHash,
        checkpointLedger: this.lastCheckpointLedger,
        checkpointHash: this.lastCheckpointHash,
      });

      const searchFrom = Math.min(currentLedger.sequence, this.lastCheckpointLedger);
      const ancestor = await this.findCommonAncestor(searchFrom, fetchLedger);
      await this.rewindToAncestor(ancestor.sequence, ancestor.hash);

      return {
        reorgDetected: true,
        rewoundToLedger: ancestor.sequence,
      };
    }

    this.recordLedgerHash(currentLedger.sequence, currentLedger.hash);
    return { reorgDetected: false };
  }

  // ── Cursor / resume ──────────────────────────────────────────────────────

  /**
   * On restart, re-process from the last confirmed checkpoint.
   * Priority:
   *   1. Redis cache checkpoint (`indexer:checkpoint:<contractId>`)
   *   2. Database table `indexer_checkpoints` if Redis cache is empty / evicted
   *   3. `MAX(ledger_seq)` from `contract_events`
   *   4. Genesis
   */
  private async initCursor(): Promise<void> {
    try {
      let resumeLedger: number | null = null;
      let resumeHash: string | null = null;

      // 1. Try Redis cache first
      try {
        const cached = await getCache<number | { last_ledger: number; last_ledger_hash?: string | null }>(
          `indexer:checkpoint:${CONTRACT_ID}`,
        );
        if (cached !== null && cached !== undefined) {
          const num = typeof cached === 'number' ? cached : cached.last_ledger;
          if (typeof num === 'number' && num > 0) {
            resumeLedger = num;
            if (typeof cached === 'object' && cached.last_ledger_hash) {
              resumeHash = cached.last_ledger_hash;
            }
            logger.info({ message: 'Resuming indexer from Redis cache checkpoint', ledger: resumeLedger });
          }
        }
      } catch {
        // Cache miss or Redis unavailable
      }

      // 2. If Redis cache is empty, resume from database checkpoint table
      if (resumeLedger === null) {
        try {
          const dbCheckpoint = await getCheckpoint(CONTRACT_ID, pool);
          if (dbCheckpoint && dbCheckpoint.last_ledger > 0) {
            resumeLedger = dbCheckpoint.last_ledger;
            resumeHash = dbCheckpoint.last_ledger_hash ?? null;
            logger.info({ message: 'Resuming indexer from database checkpoint', ledger: resumeLedger });
          }
        } catch {
          // Table might not exist yet or query failed
        }
      }

      // 3. Fall back to MAX(ledger_seq) from contract_events
      if (resumeLedger === null) {
        const { rows } = await pool.query<{ max_ledger: string | null }>(
          'SELECT MAX(ledger_seq) AS max_ledger FROM contract_events',
        );
        resumeLedger = rows[0]?.max_ledger != null ? parseInt(rows[0].max_ledger, 10) : null;
      }

      if (resumeLedger !== null && resumeLedger > 0) {
        this.cursor = String(resumeLedger);
        this.lastCheckpointLedger = resumeLedger;
        this.lastCheckpointHash = resumeHash;
        if (resumeHash) {
          this.ledgerHashHistory.set(resumeLedger, resumeHash);
        }
        logger.info({ message: 'Resuming indexer from ledger', ledger: resumeLedger });
      } else {
        this.cursor = undefined;
        logger.info({ message: 'Starting indexer from genesis (no stored events)' });
      }
    } catch (err) {
      // Table might not exist yet; start from genesis
      logger.warn({
        message: 'Could not read resume ledger, starting from genesis',
        error: err instanceof Error ? err.message : String(err),
      });
      this.cursor = undefined;
    }
  }

  // ── Poll loop ────────────────────────────────────────────────────────────

  private async pollForEvents(): Promise<void> {
    while (this.isRunning) {
      try {
        const response = await this.server.getEvents({
          filters: [
            {
              type: 'contract',
              contractIds: [CONTRACT_ID],
            },
          ],
          cursor: this.cursor,
          limit: 200,
        });

        const events = response.events as unknown as RpcEvent[];

        if (events.length > 0) {
          let persisted = 0;
          let skipped = 0;
          let reorgAbortedBatch = false;

          for (const raw of events) {
            const eventLedger = Number(raw.ledger);
            if (!isNaN(eventLedger) && (raw.ledgerHash || raw.prevLedgerHash)) {
              const continuity = await this.handleLedgerContinuity({
                sequence: eventLedger,
                hash: raw.ledgerHash ?? `ledger-${eventLedger}`,
                prevHash: raw.prevLedgerHash ?? null,
              });
              if (continuity.reorgDetected) {
                reorgAbortedBatch = true;
                break;
              }
            }

            const record = await this.parseRpcEvent(raw);
            if (!record) {
              skipped++;
              continue;
            }
            const stored = await this.storeEvent(record);
            if (stored) persisted++;
            else skipped++;
          }

          if (!reorgAbortedBatch) {
            // Advance cursor to the last event's pagingToken
            const last = events[events.length - 1];
            this.cursor = last.pagingToken ?? last.id;
            const lastLedger = Number(last.ledger);
            const lastHash = last.ledgerHash ?? last.txHash;

            logger.info({
              message: 'Indexed event batch',
              ledger: lastLedger,
              total: events.length,
              persisted,
              skipped,
            });

            // Commit checkpoint every 5 seconds or upon every 100 ledgers
            const now = Date.now();
            if (
              lastLedger - this.lastCheckpointLedger >= 100 ||
              now - this.lastCheckpointTime >= 5_000
            ) {
              await this.commitCheckpointTransaction(lastLedger, lastHash);
              this.lastCheckpointLedger = lastLedger;
              this.lastCheckpointHash = lastHash ?? null;
              if (lastHash) {
                this.recordLedgerHash(lastLedger, lastHash);
              }
              this.lastCheckpointTime = now;
            }
          }
        }

        await sleep(POLL_INTERVAL_MS);
      } catch (err) {
        logger.error({
          message: 'Event polling error',
          error: err instanceof Error ? err.message : String(err),
        });
        await sleep(ERROR_BACKOFF_MS);
      }
    }
  }

  /**
   * Commit confirmed ledger progress to database transactionally.
   */
  async commitCheckpointTransaction(ledger: number, hash?: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await saveCheckpoint(CONTRACT_ID, ledger, hash ?? null, client);
      await client.query('COMMIT');

      this.lastCheckpointLedger = ledger;
      this.lastCheckpointHash = hash ?? null;
      if (hash) {
        this.ledgerHashHistory.set(ledger, hash);
      }

      // Update Redis cache as well
      try {
        await setCache(`indexer:checkpoint:${CONTRACT_ID}`, ledger, 3600);
      } catch {
        // Non-fatal
      }
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({
        message: 'Failed to commit ledger checkpoint transaction',
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      client.release();
    }
  }

  // ── Event parsing ────────────────────────────────────────────────────────

  /**
   * Convert a raw RPC event object into a ContractEventRecord.
   * Quarantine invalid contract events before returning null. Valid events outside
   * the indexer projection and non-contract events are skipped.
   */
  private async parseRpcEvent(raw: RpcEvent): Promise<ContractEventRecord | null> {
    if (raw.type !== 'contract') return null;

    try {
      const { name, entity, data } = validateContractEvent(raw.topic, raw.value);
      // Other valid ABI events are not projected into contract_events.
      const indexedTypes: string[] = ['applied', 'withdrew', 'assigned', 'completed', 'revoked', 'maint_reg'];
      if (!indexedTypes.includes(name)) return null;

      if (typeof raw.id !== 'string' || raw.id.length === 0) {
        throw new EventValidationError('id: expected non-empty string');
      }
      const idParts = raw.id.split('-');
      const indexPart = idParts.length >= 2 ? idParts[idParts.length - 1] : '0';
      const eventIndex = /^\d+$/.test(indexPart) ? Number(indexPart) : NaN;
      const ledger = Number(raw.ledger);
      const timestamp = new Date(raw.ledgerClosedAt ?? raw.createdAt ?? '');
      if (!Number.isInteger(ledger) || ledger <= 0 || ledger > 2147483647) {
        throw new EventValidationError('ledger: expected positive PostgreSQL integer');
      }
      if (!Number.isInteger(eventIndex) || eventIndex < 0 || eventIndex > 2147483647) {
        throw new EventValidationError('id: invalid event index');
      }
      if (Number.isNaN(timestamp.getTime())) {
        throw new EventValidationError('timestamp: expected valid ledger close time');
      }
      if (raw.txHash !== undefined && (typeof raw.txHash !== 'string' || raw.txHash.length === 0)) {
        throw new EventValidationError('txHash: expected non-empty string');
      }

      const orgIndex = name === 'applied' || name === 'withdrew' ? 0 : 1;
      return {
        event_type: name as ContractEventType,
        contributor: name === 'maint_reg' ? null : entity,
        org_id: data[orgIndex] as string,
        issue_id: name === 'maint_reg' ? null : data[orgIndex + 1] as number,
        tx_hash: raw.txHash ?? raw.id,
        event_index: eventIndex,
        ledger,
        timestamp,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      // Await persistence before the poll loop may advance its cursor. A DB failure
      // propagates to the retry loop so rejected events cannot be silently lost.
      await pool.query(
        `INSERT INTO indexer_quarantine (contract_id, event_id, raw_event, reason)
         VALUES ($1, $2, $3::jsonb, $4)
         ON CONFLICT (contract_id, event_id) DO NOTHING`,
        [CONTRACT_ID, typeof raw.id === 'string' ? raw.id : null, JSON.stringify(raw, (_key, value: unknown) =>
          typeof value === 'bigint' ? value.toString() : value), reason],
      );
      logger.warn({ message: 'Contract event quarantined', contract_id: CONTRACT_ID, event_id: raw.id, reason });
      return null;
    }
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  /**
   * Insert a contract event record.
   *
   * Uses (ledger_seq, tx_hash, event_index) as the deduplication key.
   * Duplicate rows are silently skipped (ON CONFLICT DO NOTHING).
   *
   * This is safe to call after a full-history replay caused by cursor loss:
   * the unique constraint added in migration 2_event_deduplication.js
   * prevents duplicates at the database level regardless of how many times
   * the same event is re-submitted (fixes issue #575).
   *
   * @returns true if a new row was inserted, false if it was a duplicate.
   */
  private async storeEvent(record: ContractEventRecord): Promise<boolean> {
    const result = await pool.query(
      `INSERT INTO contract_events
         (event_type, contributor, org_id, issue_id, tx_hash, event_index, ledger_seq, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (ledger_seq, tx_hash, event_index) DO NOTHING`,
      [
        record.event_type,
        record.contributor,
        record.org_id,
        record.issue_id,
        record.tx_hash,
        record.event_index,
        record.ledger,
        record.timestamp,
      ],
    );

    const inserted = (result as { rowCount?: number }).rowCount === 1;

    if (inserted) {
      // Publish live update for real-time subscribers
      const liveType =
        record.event_type === 'applied'
          ? 'application_created'
          : record.event_type === 'assigned'
            ? 'assignment_created'
            : 'cap_updated';

      publishLiveEvent({
        type: liveType,
        data: {
          eventType: record.event_type,
          orgId: record.org_id,
          issueId: record.issue_id,
        },
      });
    }

    return inserted;
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Module-level singleton helpers
// ---------------------------------------------------------------------------

let _indexer: EventIndexer | null = null;

export function getEventIndexer(): EventIndexer {
  if (!_indexer) _indexer = new EventIndexer();
  return _indexer;
}

export async function startEventIndexer(): Promise<void> {
  await getEventIndexer().start();
}

export function stopEventIndexer(): void {
  _indexer?.stop();
}

/**
 * Register SIGINT / SIGTERM handlers for graceful indexer shutdown.
 */
export function registerShutdownHandlers(): void {
  const shutdown = (signal: string): void => {
    logger.info({ message: `${signal} received — stopping event indexer` });
    stopEventIndexer();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
