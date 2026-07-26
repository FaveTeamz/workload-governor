import { Pool, PoolClient } from 'pg';

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
      issue_id    TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (contributor, org_id, issue_id)
    );

    CREATE TABLE IF NOT EXISTS assignments (
      contributor TEXT NOT NULL,
      org_id      TEXT NOT NULL,
      issue_id    TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (contributor, org_id, issue_id)
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id         SERIAL PRIMARY KEY,
      key_hash   TEXT NOT NULL UNIQUE,
      label      TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
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
