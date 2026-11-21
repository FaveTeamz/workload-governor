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
    await exports.pool.query(`
    CREATE TABLE IF NOT EXISTS issues (
      id        SERIAL PRIMARY KEY,
      org_id    TEXT    NOT NULL,
      title     TEXT    NOT NULL,
      status    TEXT    NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

    CREATE TABLE IF NOT EXISTS pending_transactions (
      admin_address       TEXT NOT NULL,
      maintainer_address  TEXT NOT NULL,
      org_id              TEXT NOT NULL,
      transaction_xdr     TEXT NOT NULL,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (admin_address, maintainer_address, org_id)
    );

    CREATE TABLE IF NOT EXISTS contract_events (
      id              SERIAL PRIMARY KEY,
      event_type      TEXT NOT NULL,
      ledger_seq      INTEGER NOT NULL,
      timestamp       TIMESTAMPTZ NOT NULL,
      actor           TEXT NOT NULL,
      org_id          TEXT NOT NULL,
      issue_id        INTEGER,
      contributor     TEXT,
      data            JSONB,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_contract_events_org_id ON contract_events(org_id);
    CREATE INDEX IF NOT EXISTS idx_contract_events_timestamp ON contract_events(timestamp);
  `);
}
