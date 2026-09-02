/**
 * backfill-events.ts — CLI command to backfill historical events from Horizon
 *
 * Usage:
 *   npm run backfill -- --from-ledger=1000 --to-ledger=2000
 *   npm run backfill -- --from-ledger=1000 --to-ledger=2000 --resume
 *
 * Flags:
 *   --from-ledger=N   Starting ledger sequence (required)
 *   --to-ledger=M     Ending ledger sequence (required)
 *   --resume          Resume from last processed ledger (stores progress in DB)
 *   --batch-size=N    Events per RPC call (default: 200)
 */

import { SorobanRpc, xdr as stellarXdr, scValToNative } from '@stellar/stellar-sdk';
import { pool } from '../db';
import { logger } from '../logger';
import type { ContractEventRecord, ContractEventType } from '../eventIndexer';

// ─── Configuration ────────────────────────────────────────────────────────

const CONTRACT_ID =
  process.env['CONTRACT_ID'] ??
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

const RPC_URL =
  process.env['SOROBAN_RPC_URL'] ?? 'https://soroban-testnet.stellar.org';

const BATCH_SIZE = 200;

// ─── CLI Argument Parsing ─────────────────────────────────────────────────

function parseArgs(): {
  fromLedger: number;
  toLedger: number;
  resume: boolean;
  batchSize: number;
} {
  const args = process.argv.slice(2);
  let fromLedger: number | null = null;
  let toLedger: number | null = null;
  let resume = false;
  let batchSize = BATCH_SIZE;

  for (const arg of args) {
    if (arg.startsWith('--from-ledger=')) {
      fromLedger = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--to-ledger=')) {
      toLedger = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--resume') {
      resume = true;
    } else if (arg.startsWith('--batch-size=')) {
      batchSize = parseInt(arg.split('=')[1], 10);
    }
  }

  if (fromLedger === null || toLedger === null || Number.isNaN(fromLedger) || Number.isNaN(toLedger)) {
    console.error('Error: --from-ledger and --to-ledger are required and must be valid integers');
    console.error('Usage: npm run backfill -- --from-ledger=1000 --to-ledger=2000');
    process.exit(1);
  }

  if (fromLedger > toLedger) {
    console.error('Error: --from-ledger must be less than or equal to --to-ledger');
    process.exit(1);
  }

  return { fromLedger, toLedger, resume, batchSize };
}

// ─── XDR Helpers ──────────────────────────────────────────────────────────

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
 */
function extractContributorFromTopic(topics: string[]): string | null {
  if (topics.length < 2) return null;
  const val = decodeScVal(topics[1]);
  if (typeof val === 'string') return val;
  return null;
}

/**
 * Parse the data value tuple emitted with each event.
 */
interface ParsedData {
  org_id: string | null;
  issue_id: number | null;
}

function parseEventData(dataXdr: string, eventType: ContractEventType): ParsedData {
  const raw = decodeScVal(dataXdr);

  if (eventType === 'maintainer_registered') {
    return {
      org_id: typeof raw === 'string' ? raw : null,
      issue_id: null,
    };
  }

  if (!Array.isArray(raw)) {
    return { org_id: null, issue_id: null };
  }

  if (eventType === 'applied' || eventType === 'withdrew') {
    const [orgId, issueId] = raw as [unknown, unknown];
    return {
      org_id: typeof orgId === 'string' ? orgId : null,
      issue_id: typeof issueId === 'number' ? issueId : null,
    };
  }

  const [, orgId, issueId] = raw as [unknown, unknown, unknown];
  return {
    org_id: typeof orgId === 'string' ? orgId : null,
    issue_id: typeof issueId === 'number' ? issueId : null,
  };
}

// ─── Event Parsing ────────────────────────────────────────────────────────

interface RpcEvent {
  type: string;
  id: string;
  pagingToken: string;
  ledger: string;
  createdAt: string;
  txHash?: string;
  topic: Array<{ type: string; xdr: string }>;
  value: { type: string; xdr: string };
}

function parseRpcEvent(raw: RpcEvent): ContractEventRecord | null {
  try {
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

    const idParts = raw.id.split('-');
    const eventIndex = idParts.length >= 3 ? parseInt(idParts[2], 10) : 0;

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

// ─── Progress Tracking ────────────────────────────────────────────────────

async function getLastProcessedLedger(): Promise<number | null> {
  try {
    const { rows } = await pool.query<{ last_ledger: string | null }>(
      `SELECT MAX(ledger_seq) AS last_ledger FROM contract_events`,
    );
    const lastLedger = rows[0]?.last_ledger != null ? parseInt(rows[0].last_ledger, 10) : null;
    return lastLedger;
  } catch {
    return null;
  }
}

// ─── Event Storage ────────────────────────────────────────────────────────

async function storeEvent(record: ContractEventRecord): Promise<boolean> {
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

  return (result as { rowCount?: number }).rowCount === 1;
}

// ─── Main Backfill Logic ──────────────────────────────────────────────────

async function backfill(fromLedger: number, toLedger: number, resume: boolean): Promise<void> {
  const server = new SorobanRpc.Server(RPC_URL, { allowHttp: true });
  let startLedger = fromLedger;

  // If --resume is set, start from the last processed ledger
  if (resume) {
    const lastLedger = await getLastProcessedLedger();
    if (lastLedger !== null && lastLedger >= fromLedger) {
      startLedger = lastLedger;
      logger.info({ message: 'Resuming backfill from ledger', ledger: lastLedger });
    }
  }

  const totalLedgers = toLedger - startLedger + 1;
  let processedLedgers = 0;
  let persistedEvents = 0;
  let duplicateEvents = 0;
  let startTime = Date.now();

  logger.info({
    message: 'Starting event backfill',
    contract: CONTRACT_ID,
    fromLedger: startLedger,
    toLedger,
    resumeEnabled: resume,
  });

  let cursor: string | undefined = String(startLedger);

  while (processedLedgers < totalLedgers) {
    try {
      const response = await server.getEvents({
        filters: [
          {
            type: 'contract',
            contractIds: [CONTRACT_ID],
          },
        ],
        cursor,
        limit: 200,
      });

      const events = response.events as unknown as RpcEvent[];

      if (events.length === 0) {
        logger.info({ message: 'No more events found, backfill complete' });
        break;
      }

      for (const raw of events) {
        const record = parseRpcEvent(raw);
        if (!record) continue;

        // Stop if we've gone past the target ledger
        if (record.ledger > toLedger) {
          logger.info({
            message: 'Reached target ledger, stopping backfill',
            targetLedger: toLedger,
          });
          break;
        }

        const stored = await storeEvent(record);
        if (stored) {
          persistedEvents++;
        } else {
          duplicateEvents++;
        }
      }

      // Update cursor for next batch
      const lastEvent = events[events.length - 1];
      cursor = lastEvent.pagingToken ?? lastEvent.id;

      // Check if we've reached the target ledger
      const maxEventLedger = Math.max(...events.map((e) => parseInt(e.ledger, 10)));
      if (maxEventLedger >= toLedger) {
        processedLedgers = totalLedgers;
      } else {
        processedLedgers = maxEventLedger - startLedger + 1;
      }

      // Calculate progress and ETA
      const elapsed = Date.now() - startTime;
      const rate = elapsed > 0 ? processedLedgers / (elapsed / 1000) : 0;
      const remaining = totalLedgers - processedLedgers;
      const estimatedSecRemaining = rate > 0 ? remaining / rate : 0;

      const progressPercent = Math.round((processedLedgers / totalLedgers) * 100);
      logger.info({
        message: 'Backfill progress',
        progress: `${progressPercent}%`,
        processedLedgers,
        totalLedgers,
        persistedEvents,
        duplicateEvents,
        estimatedSecsRemaining: Math.round(estimatedSecRemaining),
      });
    } catch (err) {
      logger.error({
        message: 'Error during backfill',
        error: err instanceof Error ? err.message : String(err),
        cursor,
      });
      // Continue on transient errors
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  logger.info({
    message: 'Backfill complete',
    persistedEvents,
    duplicateEvents,
    totalEvents: persistedEvents + duplicateEvents,
    durationSeconds: totalElapsed,
  });
}

// ─── Entry Point ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    const { fromLedger, toLedger, resume } = parseArgs();
    await backfill(fromLedger, toLedger, resume);
    await pool.end();
    process.exit(0);
  } catch (err) {
    logger.error({
      message: 'Backfill failed',
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    try {
      await pool.end();
    } catch {
      // Ignore pool close errors
    }
    process.exit(1);
  }
}

main();
