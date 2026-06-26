import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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

    CREATE TABLE IF NOT EXISTS maintainers (
      address TEXT NOT NULL,
      org_id  TEXT NOT NULL,
      PRIMARY KEY (address, org_id)
    );

    CREATE TABLE IF NOT EXISTS applications (
      contributor TEXT    NOT NULL,
      org_id      TEXT    NOT NULL,
      issue_id    INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (contributor, org_id, issue_id)
    );

    CREATE TABLE IF NOT EXISTS assignments (
      contributor TEXT    NOT NULL,
      org_id      TEXT    NOT NULL,
      issue_id    INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (contributor, org_id, issue_id)
    );
  `);
}
