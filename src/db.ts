import { Pool, PoolClient } from 'pg';
import path from 'path';
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

/** Returns the shared connection pool, creating it on first call. */
export function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env['DATABASE_URL'],
      max: parseInt(process.env['DB_POOL_MAX'] ?? '10', 10),
      idleTimeoutMillis: parseInt(process.env['DB_IDLE_TIMEOUT'] ?? '30000', 10),
      connectionTimeoutMillis: parseInt(process.env['DB_CONNECTION_TIMEOUT'] ?? '5000', 10),
    });
    _pool.on('error', (err) => {
      console.error('Unexpected error on idle DB client', err);
    });
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
  const databaseUrl =
    process.env['DATABASE_URL'] ??
    (() => {
      throw new Error('DATABASE_URL environment variable is required for migrations');
    })();

  await pgMigrateRun({
    databaseUrl,
    migrationsTable: 'pgmigrations',
    dir: path.join(__dirname, '..', 'migrations'),
    direction: 'up',
    // Ensure we apply ALL pending migrations (not just one)
    count: Infinity,
    // Log migration output via console so it appears in startup logs
    log: (msg: string) => console.log('[migrate]', msg),
  });
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
