/**
 * eventIndexer.ts
 *
 * Polls the Soroban RPC node every 5 seconds for WorkloadGovernor contract events,
 * parses them into typed DB records, and persists them with deduplication.
 *
 * Supported event types (matching src/events.rs emit helpers):
 *   applied, withdrew, assigned, completed, revoked, maintainer_registered
 *
 * Deduplication key: (tx_hash, event_index)  — ON CONFLICT DO NOTHING
 * Resume: on startup, reads the highest ledger already stored and continues from there.
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
  | 'maintainer_registered';

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
 * Extract the symbol string from a Soroban ScVal topic (first topic slot).
 * The event type is emitted as a Symbol in slot[0].
 */
function extractEventType(topics: string[]): ContractEventType | null {
  if (topics.length === 0) return null;
  const val = decodeScVal(topics[0]);
  if (typeof val !== 'string') return null;
  const known: ContractEventType[] = [
    'applied',
    'withdrew',
    'assigned',
    'completed',
    'revoked',
    'maintainer_registered',
  ];
  return known.includes(val as ContractEventType) ? (val as ContractEventType) : null;
}

/**
 * Extract the contributor address from a Soroban ScVal topic (second topic slot).
 * For all 5 state-change events the contributor is in topics[1].
 */
function extractContributorFromTopic(topics: string[]): string | null {
  if (topics.length < 2) return null;
  const val = decodeScVal(topics[1]);
  if (typeof val === 'string') return val;
  return null;
}

/**
 * Parse the data value tuple emitted with each event.
 *
 * Event data layouts (from src/events.rs):
 *   applied    → data = (org_id: Symbol, issue_id: u32)
 *   withdrew   → data = (org_id: Symbol, issue_id: u32)
 *   assigned   → data = (maintainer: Address, org_id: Symbol, issue_id: u32)
 *   completed  → data = (maintainer: Address, org_id: Symbol, issue_id: u32)
 *   revoked    → data = (maintainer: Address, org_id: Symbol, issue_id: u32)
 *   maintainer_registered → data = org_id: Symbol (scalar, not tuple)
 */
interface ParsedData {
  org_id: string | null;
  issue_id: number | null;
}

function parseEventData(dataXdr: string, eventType: ContractEventType): ParsedData {
  const raw = decodeScVal(dataXdr);

  if (eventType === 'maintainer_registered') {
    // data is a plain Symbol
    return {
      org_id: typeof raw === 'string' ? raw : null,
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

// ---------------------------------------------------------------------------
// Event parsing helpers
// ---------------------------------------------------------------------------
const KNOWN_TOPICS = new Set(['applied', 'withdrawn', 'assigned', 'completed', 'revoked']);

function safeBase64Decode(b64: string): string {
  try {
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return b64;
  }
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

      const eventType = extractEventType(topics);
      if (!eventType) return null;

      const contributor =
        eventType === 'maintainer_registered'
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
   * Uses (tx_hash, event_index) as the deduplication key — duplicate rows are
   * silently skipped (ON CONFLICT DO NOTHING).
   *
   * @returns true if a new row was inserted, false if it was a duplicate.
   */
  private async storeEvent(record: ContractEventRecord): Promise<boolean> {
    const result = await pool.query(
      `INSERT INTO contract_events
         (event_type, contributor, org_id, issue_id, tx_hash, event_index, ledger_seq, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (tx_hash, event_index) DO NOTHING`,
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

    const liveType = event.type === 'applied'
      ? 'application_created'
      : event.type === 'assigned'
        ? 'assignment_created'
        : 'cap_updated';

    publishLiveEvent({
      type: liveType,
      data: { eventType: event.type, orgId: event.orgId, issueId: event.issueId },
    });
  }

  stop(): void {
    this.isRunning = false;
    logger.info({ message: 'Event indexer stopped' });
    // rowCount > 0 means a row was actually inserted
    return (result as { rowCount?: number }).rowCount === 1;
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

let indexer: EventIndexer | null = null;

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
