/**
 * EventIndexer — issue #194
 *
 * Subscribes to the Stellar Horizon SSE event stream, filters for
 * WorkloadGovernor contract events, and persists them to Postgres.
 *
 * Architecture:  Horizon SSE → EventIndexer → Postgres (events table)
 *
 * Resilience guarantees:
 *  - Resumes from the last indexed ledger on restart (stored in `indexer_cursor`)
 *  - Handles Horizon 429 / 503 with exponential back-off (cap: 60 s)
 */
import EventSource from 'eventsource';
import { pool } from './db';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const CONTRACT_ID =
  process.env['CONTRACT_ID'] ??
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

const HORIZON_URL =
  process.env['HORIZON_URL'] ?? 'https://horizon-testnet.stellar.org';

/** SSE endpoint that streams contract events for our contract */
function buildSseUrl(cursor: string): string {
  const params = new URLSearchParams({
    contract_id: CONTRACT_ID,
    cursor,
    limit: '200',
  });
  return `${HORIZON_URL}/contract_events?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface HorizonContractEvent {
  id: string;
  paging_token: string;
  ledger: number;
  ledger_closed_at: string;
  transaction_hash: string;
  topic: string[];   // base64-XDR encoded topic values
  value: string;     // base64-XDR encoded data value
  in_successful_contract_call: boolean;
}

interface ParsedEvent {
  ledger: number;
  txHash: string;
  topic: string;
  orgId: string | null;
  issueId: number | null;
  contributor: string | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Cursor persistence helpers
// ---------------------------------------------------------------------------
const CURSOR_KEY = 'event_indexer_cursor';

async function loadCursor(): Promise<string> {
  try {
    const res = await pool.query<{ value: string }>(
      `SELECT value FROM indexer_state WHERE key = $1`,
      [CURSOR_KEY],
    );
    if (res.rows.length > 0) {
      return res.rows[0]!.value;
    }
  } catch {
    // table may not exist yet — will be created by migrate()
  }
  return 'now';
}

async function saveCursor(cursor: string): Promise<void> {
  await pool.query(
    `INSERT INTO indexer_state (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [CURSOR_KEY, cursor],
  );
}

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

function extractTopic(topics: string[]): string | null {
  for (const t of topics) {
    const decoded = safeBase64Decode(t).toLowerCase();
    for (const k of KNOWN_TOPICS) {
      if (decoded.includes(k)) return k;
    }
  }
  return null;
}

function extractOrgId(topics: string[]): string | null {
  if (topics.length < 2) return null;
  const raw = safeBase64Decode(topics[1]!);
  // Strip non-printable / non-ASCII characters
  return raw.replace(/[^\x20-\x7E]/g, '').trim() || null;
}

function extractIssueId(topics: string[]): number | null {
  if (topics.length < 3) return null;
  const raw = safeBase64Decode(topics[2]!);
  const m = raw.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function extractContributor(value: string): string | null {
  const raw = safeBase64Decode(value);
  // Stellar G-addresses are 56 chars, base32 [A-Z2-7]
  const m = raw.match(/G[A-Z2-7]{54,55}/);
  return m ? m[0] : null;
}

function parseEvent(raw: HorizonContractEvent): ParsedEvent | null {
  const topic = extractTopic(raw.topic);
  if (!topic) return null;

  return {
    ledger: raw.ledger,
    txHash: raw.transaction_hash,
    topic,
    orgId: extractOrgId(raw.topic),
    issueId: extractIssueId(raw.topic),
    contributor: extractContributor(raw.value),
    createdAt: new Date(raw.ledger_closed_at),
  };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
async function storeEvent(ev: ParsedEvent): Promise<void> {
  await pool.query(
    `INSERT INTO events (ledger, tx_hash, topic, org_id, issue_id, contributor, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (tx_hash, topic) DO NOTHING`,
    [ev.ledger, ev.txHash, ev.topic, ev.orgId, ev.issueId, ev.contributor, ev.createdAt],
  );
}

// ---------------------------------------------------------------------------
// Back-off helper
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Exponential back-off: 1 s → 2 s → 4 s … cap 60 s */
function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 60_000);
}

// ---------------------------------------------------------------------------
// EventIndexer class
// ---------------------------------------------------------------------------
export class EventIndexer {
  private es: EventSource | null = null;
  private isRunning = false;
  private backoffAttempt = 0;

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info({ message: 'EventIndexer starting' });
    await this.ensureSchema();
    this.connect();
  }

  stop(): void {
    this.isRunning = false;
    this.es?.close();
    this.es = null;
    logger.info({ message: 'EventIndexer stopped' });
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async ensureSchema(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS indexer_state (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS events (
        id          BIGSERIAL PRIMARY KEY,
        ledger      INT NOT NULL,
        tx_hash     TEXT NOT NULL,
        topic       TEXT NOT NULL,
        org_id      TEXT,
        issue_id    INT,
        contributor TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (tx_hash, topic)
      );

      CREATE INDEX IF NOT EXISTS idx_events_org_id      ON events (org_id);
      CREATE INDEX IF NOT EXISTS idx_events_contributor ON events (contributor);
      CREATE INDEX IF NOT EXISTS idx_events_ledger      ON events (ledger);
    `);
  }

  private async connect(): Promise<void> {
    if (!this.isRunning) return;

    const cursor = await loadCursor();
    const url = buildSseUrl(cursor);

    logger.info({ message: 'EventIndexer opening SSE connection', cursor, url });

    this.es = new EventSource(url);

    this.es.onmessage = async (msg: MessageEvent) => {
      try {
        const raw: HorizonContractEvent = JSON.parse(msg.data as string);
        const parsed = parseEvent(raw);
        if (parsed) {
          await storeEvent(parsed);
          await saveCursor(raw.paging_token);
          this.backoffAttempt = 0; // reset on success
          logger.info({ message: 'Event indexed', topic: parsed.topic, ledger: parsed.ledger });
        }
      } catch (err) {
        logger.error({
          message: 'EventIndexer parse/store error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    this.es.onerror = async (err: Event & { status?: number }) => {
      const status = (err as { status?: number }).status;
      logger.warn({
        message: 'EventIndexer SSE error',
        status,
        attempt: this.backoffAttempt,
      });

      this.es?.close();
      this.es = null;

      if (!this.isRunning) return;

      const delay = backoffMs(this.backoffAttempt);
      this.backoffAttempt++;
      logger.info({ message: `EventIndexer reconnecting in ${delay}ms` });
      await sleep(delay);
      this.connect();
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton helpers
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
