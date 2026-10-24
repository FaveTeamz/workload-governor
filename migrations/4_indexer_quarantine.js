'use strict';

/** Preserve rejected RPC events independently of their malformed metadata. */
exports.up = (pgm) => {
  pgm.createTable('indexer_quarantine', {
    id: 'id',
    contract_id: { type: 'text', notNull: true },
    event_id: { type: 'text' },
    raw_event: { type: 'jsonb', notNull: true },
    reason: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.addConstraint('indexer_quarantine', 'indexer_quarantine_contract_id_event_id_key',
    'UNIQUE (contract_id, event_id)');
  // Soroban issue IDs are u32; PostgreSQL INTEGER only covers signed i32.
  pgm.alterColumn('contract_events', 'issue_id', { type: 'bigint' });
};

exports.down = (pgm) => {
  // PostgreSQL rejects this rollback if an indexed u32 no longer fits in i32.
  pgm.alterColumn('contract_events', 'issue_id', { type: 'integer' });
  pgm.dropTable('indexer_quarantine');
};
