/**
 * Migration 9 — Add cryptographic hash-chaining columns to audit_log.
 *
 * Up:
 *   - Creates the audit_log table if it does not already exist.
 *   - Adds previous_hash, entry_hash, and signature columns so every
 *     row is cryptographically linked to the row before it.
 *
 * Down:
 *   - Drops the three signature columns (non-destructive to core data).
 *   - Optionally drops the entire audit_log table when a full rollback
 *     is requested via the FULL_ROLLBACK env-var.
 */

'use strict';

/** @param {import('pg').Pool} pool */
async function up(pool) {
  await pool.query(`
    -- Ensure the audit_log table exists (idempotent).
    CREATE TABLE IF NOT EXISTS audit_log (
      id           BIGSERIAL    PRIMARY KEY,
      event_type   TEXT         NOT NULL,
      payload      JSONB        NOT NULL DEFAULT '{}',
      created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    -- Add the three hash-chain columns.  Each ALTER is guarded with a
    -- DO block so the migration is safe to re-run.
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'audit_log' AND column_name = 'previous_hash'
      ) THEN
        ALTER TABLE audit_log ADD COLUMN previous_hash TEXT NOT NULL DEFAULT '';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'audit_log' AND column_name = 'entry_hash'
      ) THEN
        ALTER TABLE audit_log ADD COLUMN entry_hash TEXT NOT NULL DEFAULT '';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'audit_log' AND column_name = 'signature'
      ) THEN
        ALTER TABLE audit_log ADD COLUMN signature TEXT NOT NULL DEFAULT '';
      END IF;
    END $$;

    -- Index to speed up ordered chain traversal during verification.
    CREATE INDEX IF NOT EXISTS audit_log_id_idx ON audit_log (id ASC);
  `);
}

/** @param {import('pg').Pool} pool */
async function down(pool) {
  if (process.env.FULL_ROLLBACK === '1') {
    // Full rollback: remove the entire table.
    await pool.query(`DROP TABLE IF EXISTS audit_log;`);
  } else {
    // Partial rollback: strip only the three signature columns.
    await pool.query(`
      ALTER TABLE audit_log
        DROP COLUMN IF EXISTS previous_hash,
        DROP COLUMN IF EXISTS entry_hash,
        DROP COLUMN IF EXISTS signature;
    `);
  }
}

module.exports = { up, down };
