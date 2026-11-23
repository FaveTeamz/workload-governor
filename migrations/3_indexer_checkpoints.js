/**
 * Migration: 3_indexer_checkpoints
 *
 * Creates the indexer_checkpoints table to persist indexer ledger sync checkpoints.
 * Columns:
 *   - contract_id: TEXT PRIMARY KEY
 *   - last_ledger: INTEGER NOT NULL
 *   - last_ledger_hash: TEXT
 *   - updated_at: TIMESTAMPTZ NOT NULL DEFAULT NOW()
 *
 * Fixes issue #849: Persist ledger sync checkpoints to dedicated database table.
 */

'use strict';

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable('indexer_checkpoints', {
    contract_id: {
      type: 'text',
      primaryKey: true,
      notNull: true,
    },
    last_ledger: {
      type: 'integer',
      notNull: true,
    },
    last_ledger_hash: {
      type: 'text',
      notNull: false,
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('indexer_checkpoints', 'last_ledger', {
    name: 'idx_indexer_checkpoints_last_ledger',
  });
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropIndex('indexer_checkpoints', 'last_ledger', {
    name: 'idx_indexer_checkpoints_last_ledger',
    ifExists: true,
  });
  pgm.dropTable('indexer_checkpoints', { ifExists: true });
};
