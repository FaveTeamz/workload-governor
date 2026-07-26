import { Pool, PoolClient } from 'pg';

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

let pool: Pool | null = null;

/** Returns the shared connection pool, creating it on first call. */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env['DATABASE_URL'],
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

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

/** Close the pool (used in tests / graceful shutdown). */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
