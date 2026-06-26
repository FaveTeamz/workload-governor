"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.healthCheck = healthCheck;
exports.migrate = migrate;
const pg_1 = require("pg");
const poolConfig = {
    connectionString: process.env.DATABASE_URL,
    max: parseInt(process.env.DB_POOL_MAX ?? '20', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT ?? '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT ?? '2000', 10),
};
exports.pool = new pg_1.Pool(poolConfig);
exports.pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});
async function healthCheck() {
    const client = await exports.pool.connect();
    try {
        await client.query('SELECT 1');
    }
    finally {
        client.release();
    }
}
async function runMigration(client, name, sql) {
    try {
        await client.query(sql);
        console.log(`✓ Migration: ${name}`);
    }
    catch (err) {
        console.error(`✗ Migration failed: ${name}`, err);
        throw err;
    }
}
async function migrate() {
    const client = await exports.pool.connect();
    try {
        await client.query('BEGIN');
        await runMigration(client, 'create_issues_table', `CREATE TABLE IF NOT EXISTS issues (
        id        SERIAL PRIMARY KEY,
        org_id    TEXT    NOT NULL,
        title     TEXT    NOT NULL,
        status    TEXT    NOT NULL DEFAULT 'open',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(org_id, id)
      )`);
        await runMigration(client, 'create_maintainers_table', `CREATE TABLE IF NOT EXISTS maintainers (
        address TEXT NOT NULL,
        org_id  TEXT NOT NULL,
        PRIMARY KEY (address, org_id)
      )`);
        await runMigration(client, 'create_applications_table', `CREATE TABLE IF NOT EXISTS applications (
        contributor TEXT    NOT NULL,
        org_id      TEXT    NOT NULL,
        issue_id    INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (contributor, org_id, issue_id)
      )`);
        await runMigration(client, 'create_assignments_table', `CREATE TABLE IF NOT EXISTS assignments (
        contributor TEXT    NOT NULL,
        org_id      TEXT    NOT NULL,
        issue_id    INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (contributor, org_id, issue_id)
      )`);
        await runMigration(client, 'create_sync_cursors_table', `CREATE TABLE IF NOT EXISTS sync_cursors (
        id        TEXT PRIMARY KEY,
        cursor    TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
        await runMigration(client, 'create_issues_search_index', `CREATE INDEX IF NOT EXISTS idx_issues_org_id_status
        ON issues(org_id, status)`);
        await runMigration(client, 'create_applications_contributor_index', `CREATE INDEX IF NOT EXISTS idx_applications_contributor
        ON applications(contributor)`);
        await runMigration(client, 'create_assignments_contributor_index', `CREATE INDEX IF NOT EXISTS idx_assignments_contributor
        ON assignments(contributor)`);
        await client.query('COMMIT');
        console.log('✓ All migrations completed successfully');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
