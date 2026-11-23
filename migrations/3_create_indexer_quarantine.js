/**
 * Migration: 3_create_indexer_quarantine
 *
 * Stores contract events that fail ABI/schema validation so they can be
 * inspected without preventing the indexer from advancing its cursor.
 */

'use strict';

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS indexer_quarantine (
      id            SERIAL PRIMARY KEY,
      ledger_seq    INTEGER,
      tx_hash       TEXT,
      event_index   INTEGER,
      event_type    TEXT,
      raw_xdr       JSONB NOT NULL,
      error_message TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (ledger_seq, tx_hash, event_index)
    );
  `);
  pgm.createIndex('indexer_quarantine', 'ledger_seq', {
    name: 'idx_indexer_quarantine_ledger_seq',
    ifNotExists: true,
  });
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable('indexer_quarantine', { ifExists: true });
};
