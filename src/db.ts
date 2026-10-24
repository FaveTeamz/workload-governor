import { Pool, PoolClient, PoolConfig } from 'pg';
import path from 'path';
import { logger } from './logger';
import { initTelemetry } from './telemetry';

initTelemetry();
// node-pg-migrate exposes `default` in CJS interop; use dynamic require to handle both
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pgMigrateRun: typeof import('node-pg-migrate').default = require('node-pg-migrate').default ?? require('node-pg-migrate');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrgRecord = {
  org_id: string;
  contract_address: string;
};

export type OrgEvent = {
  org_id: string;
  event_type: 'applied' | 'withdrawn' | 'assigned' | 'completed' | 'revoked';
  issue_id: string;
  contributor: string;
  tx_hash: string;
  occurred_at: Date;
};

// ---------------------------------------------------------------------------
// Connection pool
// ---------------------------------------------------------------------------

let _pool: Pool | null = null;

/** Default pool settings (issue #1035). Each can be overridden via env vars. */
export const DB_POOL_DEFAULTS = {
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
} as const;

/**
 * Parse a non-negative integer from an environment variable, falling back to
 * `fallback` when the variable is unset, empty, or not a valid integer.
 */
export function parseEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    logger.warn({ msg: `[db] Invalid value for ${name}; using default`, value: raw, default: fallback });
    return fallback;
  }
  return value;
}

/**
 * Build the node-pg pool configuration from environment variables.
 *
 *   DB_POOL_MIN            minimum connections kept alive      (default: 2)
 *   DB_POOL_MAX            maximum connections allowed         (default: 20)
 *   DB_IDLE_TIMEOUT        ms before an idle client is reaped  (default: 30000)
 *   DB_CONNECTION_TIMEOUT  ms to wait when acquiring a client  (default: 5000)
 *                          (DB_ACQUIRE_TIMEOUT is accepted as a legacy alias)
 *
 * Explicit idle/connection timeouts prevent zombie connections from piling up
 * in serverless/container environments (issue #1035).
 */
export function buildPoolConfig(): PoolConfig {
  const max = Math.max(1, parseEnvInt('DB_POOL_MAX', DB_POOL_DEFAULTS.max));
  const min = Math.min(parseEnvInt('DB_POOL_MIN', 2), max);
  const connectionTimeoutEnv =
    process.env['DB_CONNECTION_TIMEOUT'] !== undefined ? 'DB_CONNECTION_TIMEOUT' : 'DB_ACQUIRE_TIMEOUT';

  return {
    connectionString: process.env['DATABASE_URL'],
    min,
    max,
    idleTimeoutMillis: parseEnvInt('DB_IDLE_TIMEOUT', DB_POOL_DEFAULTS.idleTimeoutMillis),
    connectionTimeoutMillis: parseEnvInt(connectionTimeoutEnv, DB_POOL_DEFAULTS.connectionTimeoutMillis),
  };
}

/**
 * Handler for the pool-level `error` event. node-pg emits this when an idle
 * client loses its connection unexpectedly (e.g. backend restart, network
 * drop, server-side idle kill). Without a listener the error would crash the
 * process; with it, the broken client is discarded and the pool recovers.
 */
export function handlePoolError(err: Error & { code?: string }, pool: Pool): void {
  logger.error({
    msg: '[db] Unexpected error on idle DB client (client disconnected)',
    error: err.message,
    code: err.code,
    stack: err.stack,
    pool: {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    },
  });
}

/** Returns the shared connection pool, creating it on first call. */
export function getPool(): Pool {
  if (!_pool) {
    const pool = new Pool(buildPoolConfig());
    _pool = pool;

    // Log unexpected idle-client disconnections (issues #561, #1035)
    pool.on('error', (err) => handlePoolError(err, pool));

    // Pool event telemetry for active gauges
    const notifyPoolGauges = () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { updatePgPoolGauges } = require('./metrics');
        updatePgPoolGauges();
      } catch {
        // Ignore if metrics module not yet initialized
      }
    };

    _pool.on('connect', notifyPoolGauges);
    _pool.on('acquire', notifyPoolGauges);
    _pool.on('release', notifyPoolGauges);
    _pool.on('remove', notifyPoolGauges);

    // Optionally log new connections in non-production environments for
    // visibility into pool churn during development/staging.
    if (process.env['NODE_ENV'] !== 'production') {
      pool.on('connect', () => {
        // Fire-and-forget: log pool counts when a new connection is established
        console.debug(
          `[db] New connection established. Pool stats — total: ${pool.totalCount}, idle: ${pool.idleCount}, waiting: ${pool.waitingCount}`,
        );
      });
    }
  }
  return _pool;
}

/** Shared pool instance for direct use in route handlers. */
export const pool = getPool();

// ---------------------------------------------------------------------------
// Org / Event queries (used by SyncService — issue #310)
// ---------------------------------------------------------------------------

/** Query all registered orgs from the database. */
export async function getRegisteredOrgs(
  client: Pool | PoolClient = getPool()
): Promise<OrgRecord[]> {
  const result = await client.query<OrgRecord>(
    'SELECT org_id, contract_address FROM orgs ORDER BY created_at ASC'
  );
  return result.rows;
}

/** Persist a single org event to the database. */
export async function saveEvent(
  event: OrgEvent,
  client: Pool | PoolClient = getPool()
): Promise<void> {
  await client.query(
    `INSERT INTO events (org_id, event_type, issue_id, contributor, tx_hash, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      event.org_id,
      event.event_type,
      event.issue_id,
      event.contributor,
      event.tx_hash,
      event.occurred_at,
    ]
  );
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function healthCheck(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

/**
 * Run all pending database migrations using node-pg-migrate.
 * Migrations are loaded from the `migrations/` directory at the repo root.
 * State is tracked in the `pgmigrations` table (created automatically).
 *
 * Called automatically on app startup in src/index.ts before the server
 * begins accepting requests.
 */
export async function migrate(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS orgs (
      org_id           TEXT PRIMARY KEY,
      contract_address TEXT NOT NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS events (
      id          SERIAL PRIMARY KEY,
      org_id      TEXT NOT NULL,
      event_type  TEXT NOT NULL,
      issue_id    TEXT NOT NULL,
      contributor TEXT NOT NULL,
      tx_hash     TEXT NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_events_org_id ON events(org_id);
    CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events(occurred_at);
    CREATE INDEX IF NOT EXISTS idx_events_org_created ON events(org_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS issues (
      id         SERIAL PRIMARY KEY,
      org_id     TEXT NOT NULL,
      title      TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS maintainers (
      address TEXT NOT NULL,
      org_id  TEXT NOT NULL,
      PRIMARY KEY (address, org_id)
    );

    CREATE TABLE IF NOT EXISTS applications (
      contributor TEXT NOT NULL,
      org_id      TEXT NOT NULL,
      issue_id    INTEGER NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (contributor, org_id, issue_id)
    );

    CREATE TABLE IF NOT EXISTS assignments (
      contributor TEXT NOT NULL,
      org_id      TEXT NOT NULL,
      issue_id    INTEGER NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (contributor, org_id, issue_id)
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id             SERIAL PRIMARY KEY,
      key_hash       TEXT NOT NULL UNIQUE,
      label          TEXT NOT NULL,
      scopes         TEXT[] NOT NULL DEFAULT '{}',
      expires_at     TIMESTAMPTZ,
      rotating_until TIMESTAMPTZ,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS github_issue_labels (
      org_id     TEXT    NOT NULL,
      issue_id   INTEGER NOT NULL,
      label_name TEXT    NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (org_id, issue_id, label_name)
    );

    -- Contract events indexed from the Soroban RPC node
    CREATE TABLE IF NOT EXISTS contract_events (
      id          SERIAL PRIMARY KEY,
      event_type  TEXT        NOT NULL,
      contributor TEXT,
      org_id      TEXT,
      issue_id    INTEGER,
      tx_hash     TEXT        NOT NULL,
      event_index INTEGER     NOT NULL DEFAULT 0,
      ledger_seq  INTEGER     NOT NULL,
      timestamp   TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tx_hash, event_index)
    );

    CREATE INDEX IF NOT EXISTS idx_contract_events_contributor
      ON contract_events(contributor);
    CREATE INDEX IF NOT EXISTS idx_contract_events_ledger
      ON contract_events(ledger_seq);
    CREATE INDEX IF NOT EXISTS idx_contract_events_timestamp
      ON contract_events(timestamp DESC);

    CREATE TABLE IF NOT EXISTS indexer_checkpoints (
      contract_id      TEXT PRIMARY KEY,
      last_ledger      INTEGER NOT NULL,
      last_ledger_hash TEXT,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_indexer_checkpoints_last_ledger
      ON indexer_checkpoints(last_ledger);
  `);
}

// ---------------------------------------------------------------------------
// Indexer Checkpoints queries (issue #849)
// ---------------------------------------------------------------------------

export interface IndexerCheckpoint {
  contract_id: string;
  last_ledger: number;
  last_ledger_hash: string | null;
  updated_at: Date;
}

/**
 * Persist indexer checkpoint to database transactionally.
 */
export async function saveCheckpoint(
  contractId: string,
  lastLedger: number,
  lastLedgerHash?: string | null,
  client?: Pool | PoolClient,
): Promise<void> {
  const runner = client ?? getPool();
  await runner.query(
    `INSERT INTO indexer_checkpoints (contract_id, last_ledger, last_ledger_hash, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (contract_id)
     DO UPDATE SET last_ledger = EXCLUDED.last_ledger,
                   last_ledger_hash = EXCLUDED.last_ledger_hash,
                   updated_at = NOW()`,
    [contractId, lastLedger, lastLedgerHash ?? null],
  );
}

/**
 * Retrieve indexer checkpoint for contract from database.
 */
export async function getCheckpoint(
  contractId: string,
  client?: Pool | PoolClient,
): Promise<IndexerCheckpoint | null> {
  const runner = client ?? getPool();
  const res = await runner.query<IndexerCheckpoint>(
    `SELECT contract_id, last_ledger, last_ledger_hash, updated_at
     FROM indexer_checkpoints
     WHERE contract_id = $1`,
    [contractId],
  );
  return res.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/** Close the pool (used in tests / graceful shutdown). */
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

