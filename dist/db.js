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
async function migrate() {
    const client = await exports.pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
      CREATE TABLE IF NOT EXISTS issues (
        id        SERIAL PRIMARY KEY,
        org_id    TEXT    NOT NULL,
        title     TEXT    NOT NULL,
        status    TEXT    NOT NULL DEFAULT 'open',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
        await client.query(`
      CREATE TABLE IF NOT EXISTS maintainers (
        address TEXT NOT NULL,
        org_id  TEXT NOT NULL,
        PRIMARY KEY (address, org_id)
      );
    `);
        await client.query(`
      CREATE TABLE IF NOT EXISTS applications (
        contributor TEXT    NOT NULL,
        org_id      TEXT    NOT NULL,
        issue_id    INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (contributor, org_id, issue_id)
      );
    `);
        await client.query(`
      CREATE TABLE IF NOT EXISTS assignments (
        contributor TEXT    NOT NULL,
        org_id      TEXT    NOT NULL,
        issue_id    INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (contributor, org_id, issue_id)
      );
    `);
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
