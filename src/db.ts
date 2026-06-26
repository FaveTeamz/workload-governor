import { Pool, PoolClient } from 'pg';

const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_MAX ?? '20', 10),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT ?? '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT ?? '2000', 10),
};

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export async function healthCheck(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}

async function runMigration(client: PoolClient, name: string, sql: string): Promise<void> {
  try {
    await client.query(sql);
    console.log(`✓ Migration: ${name}`);
  } catch (err) {
    console.error(`✗ Migration failed: ${name}`, err);
    throw err;
  }
}

export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS issues (
      id        INTEGER PRIMARY KEY,
      github_id INTEGER NOT NULL UNIQUE,
      org       TEXT    NOT NULL,
      title     TEXT    NOT NULL,
      body      TEXT,
      labels    TEXT[],
      state     TEXT    NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_issues_org ON issues(org);
    CREATE INDEX IF NOT EXISTS idx_issues_updated_at ON issues(updated_at);

    CREATE TABLE IF NOT EXISTS sync_metadata (
      id           SERIAL PRIMARY KEY,
      org          TEXT    NOT NULL UNIQUE,
      last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    await runMigration(
      client,
      'create_issues_search_index',
      `CREATE INDEX IF NOT EXISTS idx_issues_org_id_status
        ON issues(org_id, status)`,
    );

    await runMigration(
      client,
      'create_applications_contributor_index',
      `CREATE INDEX IF NOT EXISTS idx_applications_contributor
        ON applications(contributor)`,
    );

    await runMigration(
      client,
      'create_assignments_contributor_index',
      `CREATE INDEX IF NOT EXISTS idx_assignments_contributor
        ON assignments(contributor)`,
    );

    await client.query('COMMIT');
    console.log('✓ All migrations completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
