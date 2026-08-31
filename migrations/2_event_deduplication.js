/**
 * Migration: 2_event_deduplication
 *
 * Adds a unique constraint on (ledger_seq, tx_hash, event_index) to the
 * contract_events table to prevent duplicate event rows when the indexer
 * replays history after a cursor loss.
 *
 * The existing UNIQUE (tx_hash, event_index) constraint is dropped first
 * because it does not include ledger_seq and could in theory clash across
 * ledgers with synthetic events that reuse the same tx_hash fallback value.
 *
 * The INSERT in eventIndexer.ts is updated to use ON CONFLICT
 * (ledger_seq, tx_hash, event_index) DO NOTHING.
 *
 * Fixes issue #575: Event indexer duplicates events on restart after cursor loss.
 */

'use strict';

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Drop the old two-column unique constraint if it exists
  pgm.sql(`
    ALTER TABLE contract_events
      DROP CONSTRAINT IF EXISTS contract_events_tx_hash_event_index_key;
  `);

  // Add the new three-column deduplication constraint
  pgm.addConstraint(
    'contract_events',
    'contract_events_ledger_tx_event_unique',
    'UNIQUE (ledger_seq, tx_hash, event_index)',
  );

  // Helpful index to speed up duplicate-check lookups during re-indexing
  pgm.createIndex(
    'contract_events',
    ['ledger_seq', 'tx_hash', 'event_index'],
    { name: 'idx_contract_events_dedup', unique: true, ifNotExists: true },
  );
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropIndex('contract_events', ['ledger_seq', 'tx_hash', 'event_index'], {
    name: 'idx_contract_events_dedup',
    ifExists: true,
  });

  pgm.dropConstraint('contract_events', 'contract_events_ledger_tx_event_unique', {
    ifExists: true,
  });

  // Restore the original two-column unique constraint
  pgm.addConstraint(
    'contract_events',
    'contract_events_tx_hash_event_index_key',
    'UNIQUE (tx_hash, event_index)',
  );
};
