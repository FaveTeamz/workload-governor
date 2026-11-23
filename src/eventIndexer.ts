/**
 * eventIndexer.ts
 *
 * Polls the Soroban RPC node every 5 seconds for WorkloadGovernor contract events,
 * parses them into typed DB records, and persists them with deduplication.
 *
 * Supported event topics (mapped to DB event types):
 *   app_sub, app_wdw, assigned, completed, revoked, maint_reg
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
import { isSupportedContractEvent, validateContractEvent } from './schemas/events';

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
// RPC event shape (SDK v11 / RPC spec)
// ---------------------------------------------------------------------------

export interface RpcEvent {
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
  topic?: Array<{ type: string; xdr: string }>;
  value?: { type: string; xdr: string };
}

export interface InvalidRpcEvent {
  ledgerSeq: number | null;
  txHash: string | null;
  eventIndex: number | null;
  eventType: string | null;
  rawXdr: { topics: unknown; value: unknown };
  error: string;
}

export type RpcEventParseResult =
  | { kind: 'ignored' }
  | { kind: 'valid'; record: ContractEventRecord }
  | { kind: 'invalid'; details: InvalidRpcEvent };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseUnsignedInteger(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function getEventIndex(id: unknown): number | null {
  if (typeof id !== 'string') return null;
  const parts = id.split('-');
  if (parts.length < 3) return null;
  return parseUnsignedInteger(parts[parts.length - 1]);
}

function eventXdr(raw: Record<string, unknown>): InvalidRpcEvent['rawXdr'] {
  const topics = Array.isArray(raw.topic)
    ? raw.topic.map((topic) => (isRecord(topic) ? topic.xdr ?? null : null))
    : raw.topic ?? null;
  const value = isRecord(raw.value) ? raw.value.xdr ?? null : null;
  return { topics, value };
}

function invalidEvent(
  raw: Record<string, unknown>,
  eventType: string | null,
  rawXdr: InvalidRpcEvent['rawXdr'],
  error: string,
): RpcEventParseResult {
  const id = raw.id;
  const ledgerSeq = parseUnsignedInteger(raw.ledger);
  const txHash =
    typeof raw.txHash === 'string' ? raw.txHash : typeof id === 'string' ? id : null;

  return {
    kind: 'invalid',
    details: {
      ledgerSeq,
      txHash,
      eventIndex: getEventIndex(id),
      eventType,
      rawXdr,
      error,
    },
  };
}

function decodeScValResult(
  value: unknown,
): { success: true; value: unknown } | { success: false; error: string } {
  if (typeof value !== 'string') {
    return { success: false, error: 'XDR value is missing or not a string' };
  }
  try {
    return {
      success: true,
      value: scValToNative(stellarXdr.ScVal.fromXDR(value, 'base64')),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function parseRpcEvent(rawEvent: unknown): RpcEventParseResult {
  if (!isRecord(rawEvent)) {
    return invalidEvent({}, null, { topics: null, value: null }, 'RPC event is not an object');
  }
  const raw = rawEvent;
  if (raw.type !== 'contract') return { kind: 'ignored' };

  const rawXdr = eventXdr(raw);
  if (!Array.isArray(raw.topic) || raw.topic.length === 0) {
    return invalidEvent(raw, null, rawXdr, 'Contract event has no topic XDR values');
  }

  const firstTopic = isRecord(raw.topic[0]) ? raw.topic[0].xdr : null;
  const decodedEventName = decodeScValResult(firstTopic);
  if (!decodedEventName.success) {
    return invalidEvent(raw, null, rawXdr, `Could not decode event type topic: ${decodedEventName.error}`);
  }
  if (typeof decodedEventName.value !== 'string') {
    return invalidEvent(raw, null, rawXdr, 'Event type topic is not a Symbol');
  }

  const eventName = decodedEventName.value;
  if (!isSupportedContractEvent(eventName)) return { kind: 'ignored' };

  const topics: unknown[] = [];
  for (const [index, topic] of raw.topic.entries()) {
    const decoded = decodeScValResult(isRecord(topic) ? topic.xdr : null);
    if (!decoded.success) {
      return invalidEvent(raw, eventName, rawXdr, `Could not decode topic[${index}]: ${decoded.error}`);
    }
    topics.push(decoded.value);
  }

  const dataXdr = isRecord(raw.value) ? raw.value.xdr : null;
  const decodedData = decodeScValResult(dataXdr);
  if (!decodedData.success) {
    return invalidEvent(raw, eventName, rawXdr, `Could not decode event data: ${decodedData.error}`);
  }

  const validation = validateContractEvent(eventName, topics, decodedData.value);
  if (!validation.success) return invalidEvent(raw, eventName, rawXdr, validation.error);

  const ledger = parseUnsignedInteger(raw.ledger);
  const eventIndex = getEventIndex(raw.id);
  const txHash = typeof raw.txHash === 'string' ? raw.txHash : raw.id;
  const timestamp = typeof raw.createdAt === 'string' ? new Date(raw.createdAt) : null;
  if (
    ledger === null ||
    eventIndex === null ||
    typeof txHash !== 'string' ||
    txHash.length === 0 ||
    !timestamp ||
    Number.isNaN(timestamp.getTime())
  ) {
    return invalidEvent(
      raw,
      eventName,
      rawXdr,
      'Event metadata has an invalid ledger, id, transaction hash, or timestamp',
    );
  }

  return {
    kind: 'valid',
    record: {
      ...validation.event,
      tx_hash: txHash,
      event_index: eventIndex,
      ledger,
      timestamp,
    },
  };
}

export async function quarantineRpcEvent(details: InvalidRpcEvent): Promise<void> {
  const message = `Invalid event schema on ledger ${details.ledgerSeq ?? 'unknown'}, tx ${details.txHash ?? 'unknown'}`;
  logger.error({
    message,
    eventType: details.eventType,
    eventIndex: details.eventIndex,
    error: details.error,
    rawXdr: details.rawXdr,
  });

  await pool.query(
    `INSERT INTO indexer_quarantine
       (ledger_seq, tx_hash, event_index, event_type, raw_xdr, error_message)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT DO NOTHING`,
    [
      details.ledgerSeq,
      details.txHash,
      details.eventIndex,
      details.eventType,
      JSON.stringify(details.rawXdr),
      details.error,
    ],
  );
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
          let quarantined = 0;

          for (const raw of events) {
            const parsed = parseRpcEvent(raw);
            if (parsed.kind === 'ignored') {
              skipped++;
              continue;
            }
            if (parsed.kind === 'invalid') {
              await quarantineRpcEvent(parsed.details);
              quarantined++;
              skipped++;
              continue;
            }
            const stored = await this.storeEvent(parsed.record);
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
            quarantined,
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
