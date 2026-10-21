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
 * Resume: on startup, reads the highest ledger already stored and continues
 *   from there, relying on the unique constraint to skip already-seen events.
 */

import { SorobanRpc, xdr as stellarXdr, scValToNative } from '@stellar/stellar-sdk';
import { pool } from './db';
import { logger } from './logger';
import { publishLiveEvent } from './services/event-bus';

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
// Event types
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

// ---------------------------------------------------------------------------
// XDR helpers
// ---------------------------------------------------------------------------

/**
 * Safely decode an XDR base64 string to its native JS value.
 * Returns null if decoding fails.
 */
function decodeScVal(xdrBase64: string): unknown {
  try {
    const scVal = stellarXdr.ScVal.fromXDR(xdrBase64, 'base64');
    return scValToNative(scVal);
  } catch {
    return null;
  }
}

/**
 * Validate that topics[0] == "WG" (the contract namespace discriminant).
 * Returns false for any event that does not belong to WorkloadGovernor.
 * (#829 SC-004: structured 3-topic schema)
 */
function isWorkloadGovernorEvent(topics: string[]): boolean {
  if (topics.length < 3) return false;
  const val = decodeScVal(topics[0]);
  return val === 'WG';
}

/**
 * Extract the event type symbol from topics[1].
 * With the 3-topic schema: topics[0]="WG", topics[1]=event_name, topics[2]=entity.
 */
function extractEventType(topics: string[]): ContractEventType | null {
  if (topics.length < 3) return null;
  const val = decodeScVal(topics[1]);
  if (typeof val !== 'string') return null;
  const known: ContractEventType[] = [
    'applied',
    'withdrew',
    'assigned',
    'completed',
    'revoked',
    'maint_reg',
  ];
  return known.includes(val as ContractEventType) ? (val as ContractEventType) : null;
}

/**
 * Extract the primary entity address from topics[2].
 * With the 3-topic schema the primary entity (contributor or admin) is always
 * in the third slot, making indexer topic-filter queries unambiguous.
 */
function extractContributorFromTopic(topics: string[]): string | null {
  if (topics.length < 3) return null;
  const val = decodeScVal(topics[2]);
  if (typeof val === 'string') return val;
  return null;
}

/**
 * Parse the data value tuple emitted with each event.
 *
 * Event data layouts (from src/events.rs — 3-topic schema):
 *   applied    → data = (org_id: Symbol, issue_id: u32)
 *   withdrew   → data = (org_id: Symbol, issue_id: u32)
 *   assigned   → data = (maintainer: Address, org_id: Symbol, issue_id: u32)
 *   completed  → data = (maintainer: Address, org_id: Symbol, issue_id: u32)
 *   revoked    → data = (maintainer: Address, org_id: Symbol, issue_id: u32)
 *   maint_reg  → data = (admin: Address, org_id: Symbol)
 */
interface ParsedData {
  org_id: string | null;
  issue_id: number | null;
}

function parseEventData(dataXdr: string, eventType: ContractEventType): ParsedData {
  const raw = decodeScVal(dataXdr);

  if (eventType === 'maint_reg') {
    // data = (admin: Address, org_id: Symbol)
    if (!Array.isArray(raw)) {
      return { org_id: null, issue_id: null };
    }
    const [, orgId] = raw as [unknown, unknown];
    return {
      org_id: typeof orgId === 'string' ? orgId : null,
      issue_id: null,
    };
  }

  // All other events emit a tuple
  if (!Array.isArray(raw)) {
    return { org_id: null, issue_id: null };
  }

  if (eventType === 'applied' || eventType === 'withdrew') {
    // (org_id, issue_id)
    const [orgId, issueId] = raw as [unknown, unknown];
    return {
      org_id: typeof orgId === 'string' ? orgId : null,
      issue_id: typeof issueId === 'number' ? issueId : null,
    };
  }

  // assigned / completed / revoked → (maintainer, org_id, issue_id)
  const [, orgId, issueId] = raw as [unknown, unknown, unknown];
  return {
    org_id: typeof orgId === 'string' ? orgId : null,
    issue_id: typeof issueId === 'number' ? issueId : null,
  };
}

// ---------------------------------------------------------------------------
// RPC event shape (SDK v11 / RPC spec)
// ---------------------------------------------------------------------------

interface RpcEvent {
  /** "contract" | "system" | "diagnostic" */
  type: string;
  /** "<ledger>-<tx_index>-<event_index>" — paging cursor */
  id: string;
  pagingToken: string;
  /** ledger sequence number as string */
  ledger: string;
  /** ISO-8601 creation timestamp */
  createdAt: string;
  txHash?: string;
  topic: Array<{ type: string; xdr: string }>;
  value: { type: string; xdr: string };
}

// ---------------------------------------------------------------------------
// EventIndexer class
// ---------------------------------------------------------------------------

export class EventIndexer {
  private server: SorobanRpc.Server;
  /** Paging cursor for the next RPC call. Undefined means start from resume ledger. */
  private cursor: string | undefined;
  private isRunning = false;

  constructor() {
    this.server = new SorobanRpc.Server(RPC_URL, { allowHttp: true });
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

  // ── Cursor / resume ──────────────────────────────────────────────────────

  /**
   * On restart, re-process from the last finalized ledger to handle reorgs.
   * Uses the highest ledger_seq stored in contract_events as the resume point.
   *
   * Because INSERT uses ON CONFLICT DO NOTHING, replaying events from the
   * resume ledger is safe — already-indexed events are silently skipped.
   * This prevents duplicates even if the cursor is lost (fixes issue #575).
   */
  private async initCursor(): Promise<void> {
    try {
      const { rows } = await pool.query<{ max_ledger: string | null }>(
        'SELECT MAX(ledger_seq) AS max_ledger FROM contract_events',
      );
      const maxLedger = rows[0]?.max_ledger != null ? parseInt(rows[0].max_ledger, 10) : null;

      if (maxLedger !== null && maxLedger > 0) {
        // Use the last finalized ledger as the start cursor so we re-fetch
        // that ledger's events and handle any potential reorg.
        // The cursor format expected by getEvents is "<ledger>-<tx>-<event>"
        // Passing just the ledger number as a numeric string is also accepted.
        this.cursor = String(maxLedger);
        logger.info({ message: 'Resuming indexer from ledger', ledger: maxLedger });
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

          for (const raw of events) {
            const record = this.parseRpcEvent(raw);
            if (!record) {
              skipped++;
              continue;
            }
            const stored = await this.storeEvent(record);
            if (stored) persisted++;
            else skipped++;
          }

          // Advance cursor to the last event's pagingToken
          const last = events[events.length - 1];
          this.cursor = last.pagingToken ?? last.id;

          logger.info({
            message: 'Indexed event batch',
            ledger: parseInt(events[events.length - 1].ledger, 10),
            total: events.length,
            persisted,
            skipped,
          });
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

  // ── Event parsing ────────────────────────────────────────────────────────

  /**
   * Convert a raw RPC event object into a ContractEventRecord.
   * Returns null if the event is unknown or malformed.
   */
  private parseRpcEvent(raw: RpcEvent): ContractEventRecord | null {
    try {
      // Only process contract events
      if (raw.type !== 'contract') return null;

      const topics = raw.topic?.map((t) => t.xdr) ?? [];
      const dataXdr = raw.value?.xdr ?? '';

      // #829 SC-004: reject events that do not carry the WG namespace discriminant
      // in topics[0].  This prevents false positives from other contracts sharing
      // the same RPC stream.
      if (!isWorkloadGovernorEvent(topics)) return null;

      const eventType = extractEventType(topics);
      if (!eventType) return null;

      // Primary entity is always topics[2] in the 3-topic schema.
      // maintainer_registered events have an admin in topics[2] but no contributor.
      const contributor =
        eventType === 'maint_reg'
          ? null
          : extractContributorFromTopic(topics);

      const { org_id, issue_id } = parseEventData(dataXdr, eventType);

      // Parse the event index from the id string: "<ledger>-<tx_index>-<event_index>"
      const idParts = raw.id.split('-');
      const eventIndex = idParts.length >= 3 ? parseInt(idParts[2], 10) : 0;

      // tx_hash may be undefined for some synthetic events; fall back to id
      const txHash = raw.txHash ?? raw.id;

      const ledger = parseInt(raw.ledger, 10);
      const timestamp = new Date(raw.createdAt);

      return {
        event_type: eventType,
        contributor,
        org_id,
        issue_id,
        tx_hash: txHash,
        event_index: eventIndex,
        ledger,
        timestamp,
      };
    } catch {
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
