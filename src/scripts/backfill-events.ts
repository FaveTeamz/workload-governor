#!/usr/bin/env ts-node
/**
 * backfill-events.ts
 *
 * CLI tool for backfilling historical Soroban contract events into the
 * contract_events table.
 *
 * Usage:
 *   ts-node src/scripts/backfill-events.ts [options]
 *
 * Options:
 *   --dry-run             Log event statistics without inserting into the DB
 *   --batch-size <n>      Number of events to process per RPC fetch (default: 100)
 *   --resume              Resume from the last saved ledger in .backfill-checkpoint.json
 *   --from-ledger <n>     Ledger sequence to start from (ignored when --resume is used)
 *   --to-ledger <n>       Ledger sequence to stop at (inclusive)
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { SorobanRpc } from '@stellar/stellar-sdk';
import { pool } from '../db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContractEventResource {
  type: string;
  id: string;
  pagingToken: string;
  ledger: string;
  createdAt: string;
  topic: Array<{ type: string; xdr: string }>;
  value: Array<{ type: string; xdr: string }>;
}

interface ParsedEvent {
  type: string;
  ledger: number;
  timestamp: Date;
  actor: string;
  orgId: string;
  issueId: number | null;
  contributor: string | null;
  data: Record<string, unknown>;
}

interface Checkpoint {
  lastLedger: number;
  processedAt: string;
}

interface BackfillStats {
  totalFetched: number;
  totalParsed: number;
  totalInserted: number;
  totalSkipped: number;
  ledgersProcessed: number;
  estimatedStorageBytes: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHECKPOINT_FILE = path.resolve(process.cwd(), '.backfill-checkpoint.json');
const CHECKPOINT_INTERVAL = 1000; // Persist checkpoint every N ledgers
const CONTRACT_ID =
  process.env.CONTRACT_ID ??
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const RPC_URL = process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';

// Approximate bytes per stored event row (type + ledger + ts + actor + org + data JSON)
const BYTES_PER_EVENT_ESTIMATE = 512;

// ---------------------------------------------------------------------------
// Checkpoint helpers
// ---------------------------------------------------------------------------

function loadCheckpoint(): Checkpoint | null {
  try {
    if (!fs.existsSync(CHECKPOINT_FILE)) {
      return null;
    }
    const raw = fs.readFileSync(CHECKPOINT_FILE, 'utf8');
    return JSON.parse(raw) as Checkpoint;
  } catch {
    return null;
  }
}

function saveCheckpoint(lastLedger: number): void {
  const checkpoint: Checkpoint = {
    lastLedger,
    processedAt: new Date().toISOString(),
  };
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Event parsing (mirrors EventIndexer logic)
// ---------------------------------------------------------------------------

function extractEventType(topics: Array<{ xdr: string }>): string | null {
  if (topics.length === 0) return null;
  const xdr = topics[0].xdr;
  if (xdr.includes('applied')) return 'applied';
  if (xdr.includes('withdrawn')) return 'withdrawn';
  if (xdr.includes('assigned')) return 'assigned';
  if (xdr.includes('completed')) return 'completed';
  if (xdr.includes('revoked')) return 'revoked';
  return null;
}

function parseEvent(event: ContractEventResource): ParsedEvent | null {
  try {
    const topics = event.topic ?? [];
    const values = event.value ?? [];

    if (topics.length === 0) return null;

    const eventType = extractEventType(topics);
    if (!eventType) return null;

    const ledger = parseInt(event.ledger, 10);
    const timestamp = new Date(event.createdAt);
    const actor = values.length > 0 ? values[0].xdr.substring(0, 20) : 'unknown';
    const orgId = values.length > 1 ? values[1].xdr.substring(0, 20) : 'unknown';

    let issueId: number | null = null;
    if (values.length > 2) {
      const match = values[2].xdr.match(/\d+/);
      issueId = match ? parseInt(match[0], 10) : null;
    }

    const contributor = values.length > 3 ? values[3].xdr.substring(0, 20) : null;

    return {
      type: eventType,
      ledger,
      timestamp,
      actor,
      orgId,
      issueId,
      contributor,
      data: {
        topics: topics.map((t) => t),
        values: values.map((v) => v),
      },
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// DB insert
// ---------------------------------------------------------------------------

async function insertEvent(event: ParsedEvent): Promise<boolean> {
  const result = await pool.query(
    `INSERT INTO contract_events
       (event_type, ledger_seq, timestamp, actor, org_id, issue_id, contributor, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      event.type,
      event.ledger,
      event.timestamp,
      event.actor,
      event.orgId,
      event.issueId,
      event.contributor,
      JSON.stringify(event.data),
    ],
  );
  // Returns true if a row was actually inserted (not a conflict skip).
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Main backfill loop
// ---------------------------------------------------------------------------

async function runBackfill(options: {
  dryRun: boolean;
  batchSize: number;
  resume: boolean;
  fromLedger?: number;
  toLedger?: number;
}): Promise<void> {
  const { dryRun, batchSize, resume, fromLedger, toLedger } = options;

  const server = new SorobanRpc.Server(RPC_URL, { allowHttp: true });

  const stats: BackfillStats = {
    totalFetched: 0,
    totalParsed: 0,
    totalInserted: 0,
    totalSkipped: 0,
    ledgersProcessed: 0,
    estimatedStorageBytes: 0,
  };

  // Determine starting cursor / ledger.
  let cursor: string | undefined;
  let currentLedger: number | undefined;

  if (resume) {
    const checkpoint = loadCheckpoint();
    if (checkpoint) {
      console.log(
        `[backfill] Resuming from checkpoint: ledger ${checkpoint.lastLedger} (saved at ${checkpoint.processedAt})`,
      );
      currentLedger = checkpoint.lastLedger + 1;
    } else {
      console.log('[backfill] No checkpoint found — starting from the beginning');
    }
  } else if (fromLedger !== undefined) {
    currentLedger = fromLedger;
    console.log(`[backfill] Starting from ledger ${currentLedger}`);
  }

  if (dryRun) {
    console.log('[backfill] *** DRY-RUN MODE — no database writes will be performed ***');
  }

  let ledgersSinceCheckpoint = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Build the filter; optionally scope by ledger range.
    const fetchOptions: Parameters<typeof server.getEvents>[0] = {
      filters: [
        {
          type: 'contract',
          contractIds: [CONTRACT_ID],
        },
      ],
      startLedger: cursor === undefined ? fromLedger : undefined,
      cursor,
      limit: batchSize,
    };

    let events: Awaited<ReturnType<typeof server.getEvents>>;

    try {
      events = await server.getEvents(fetchOptions);
    } catch (err) {
      console.error(
        '[backfill] RPC error:',
        err instanceof Error ? err.message : String(err),
      );
      // Brief back-off before retrying.
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    if (events.events.length === 0) {
      // No more events — we have caught up.
      break;
    }

    const inRangeEvents = (events.events as unknown as ContractEventResource[]).filter((event) => {
      const ledger = Number(event.ledger);
      return (fromLedger === undefined || ledger >= fromLedger) &&
        (toLedger === undefined || ledger <= toLedger);
    });
    stats.totalFetched += inRangeEvents.length;

    for (const event of inRangeEvents) {
      const parsed = parseEvent(event);

      if (!parsed) {
        stats.totalSkipped++;
        continue;
      }

      stats.totalParsed++;

      if (dryRun) {
        // In dry-run mode just accumulate stats.
        stats.estimatedStorageBytes += BYTES_PER_EVENT_ESTIMATE;
        stats.totalInserted++;
      } else {
        const inserted = await insertEvent(parsed);
        if (inserted) {
          stats.totalInserted++;
        } else {
          stats.totalSkipped++;
        }
      }
    }

    const passedToLedger = toLedger !== undefined &&
      (events.events as unknown as ContractEventResource[]).some((event) => Number(event.ledger) > toLedger);
    if (passedToLedger) {
      console.log(`[backfill] Reached to-ledger ${toLedger} — stopping`);
      break;
    }

    // Advance cursor to the last event included in the requested range.
    const lastEvent = inRangeEvents[inRangeEvents.length - 1];
    if (!lastEvent) break;
    cursor = lastEvent.pagingToken;
    const lastLedger = Number(lastEvent.ledger);

    if (currentLedger === undefined || lastLedger > currentLedger) {
      const delta =
        currentLedger !== undefined ? lastLedger - currentLedger : 0;
      ledgersSinceCheckpoint += delta;
      currentLedger = lastLedger;
      stats.ledgersProcessed += delta || 1;
    }

    console.log(
      `[backfill] Processed up to ledger ${currentLedger} | ` +
        `fetched=${stats.totalFetched} parsed=${stats.totalParsed} ` +
        `inserted=${stats.totalInserted} skipped=${stats.totalSkipped}`,
    );

    // Persist checkpoint every CHECKPOINT_INTERVAL ledgers.
    if (!dryRun && ledgersSinceCheckpoint >= CHECKPOINT_INTERVAL) {
      saveCheckpoint(currentLedger);
      console.log(`[backfill] Checkpoint saved at ledger ${currentLedger}`);
      ledgersSinceCheckpoint = 0;
    }

    // If the RPC returned fewer events than batchSize we have reached the tip.
    if (events.events.length < batchSize) {
      break;
    }
  }

  // Save final checkpoint.
  if (!dryRun && currentLedger !== undefined) {
    saveCheckpoint(currentLedger);
    console.log(`[backfill] Final checkpoint saved at ledger ${currentLedger}`);
  }

  printSummary(stats, dryRun);

  if (!dryRun) {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Summary printer
// ---------------------------------------------------------------------------

function printSummary(stats: BackfillStats, dryRun: boolean): void {
  console.log('\n==============================');
  console.log(' Backfill summary');
  console.log('==============================');
  console.log(`  Mode            : ${dryRun ? 'DRY-RUN (no writes)' : 'LIVE'}`);
  console.log(`  Total fetched   : ${stats.totalFetched}`);
  console.log(`  Total parsed    : ${stats.totalParsed}`);
  if (dryRun) {
    console.log(`  Would insert    : ${stats.totalInserted}`);
    console.log(
      `  Est. storage    : ${(stats.estimatedStorageBytes / 1024).toFixed(1)} KB` +
        ` (~${BYTES_PER_EVENT_ESTIMATE} bytes/event)`,
    );
  } else {
    console.log(`  Inserted        : ${stats.totalInserted}`);
  }
  console.log(`  Skipped/dup     : ${stats.totalSkipped}`);
  console.log('==============================\n');
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const argv = yargs(hideBin(process.argv))
  .scriptName('backfill-events')
  .usage('$0 [options]')
  .option('dry-run', {
    alias: 'd',
    type: 'boolean',
    default: false,
    description: 'Report event statistics without writing to the database',
  })
  .option('batch-size', {
    alias: 'b',
    type: 'number',
    default: 100,
    description: 'Number of events to fetch per RPC call',
  })
  .option('resume', {
    alias: 'r',
    type: 'boolean',
    default: false,
    description: 'Resume from the last ledger saved in .backfill-checkpoint.json',
  })
  .option('start-ledger', {
    alias: 's',
    type: 'number',
    description: 'Ledger sequence number to start from (alias: --from-ledger)',
  })
  .option('from-ledger', {
    type: 'number',
    description: 'Ledger sequence number to start from (ignored when --resume is set)',
  })
  .option('end-ledger', {
    alias: 'e',
    type: 'number',
    description: 'Ledger sequence number to stop at (inclusive; alias: --to-ledger)',
  })
  .option('to-ledger', {
    type: 'number',
    description: 'Ledger sequence number to stop at (inclusive)',
  })
  .check((args) => {
    const startLedger = args['from-ledger'] ?? args['start-ledger'];
    const endLedger = args['to-ledger'] ?? args['end-ledger'];
    if (startLedger !== undefined && (!Number.isInteger(startLedger) || startLedger < 1)) {
      throw new Error('--from-ledger must be a positive integer');
    }
    if (endLedger !== undefined && (!Number.isInteger(endLedger) || endLedger < 1)) {
      throw new Error('--to-ledger must be a positive integer');
    }
    if (startLedger !== undefined && endLedger !== undefined && startLedger > endLedger) {
      throw new Error('--from-ledger must be less than or equal to --to-ledger');
    }
    return true;
  })
  .example('$0 --dry-run', 'Estimate event volume without writing to the DB')
  .example(
    '$0 --batch-size 500 --from-ledger 1000000 --to-ledger 1001000',
    'Backfill from ledger 1,000,000 with large batches',
  )
  .example('$0 --resume', 'Continue a previously interrupted backfill')
  .help()
  .parseSync();

runBackfill({
  dryRun: argv['dry-run'],
  batchSize: argv['batch-size'],
  resume: argv['resume'],
  fromLedger: argv['from-ledger'] ?? argv['start-ledger'],
  toLedger: argv['to-ledger'] ?? argv['end-ledger'],
}).catch((err) => {
  console.error('[backfill] Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
