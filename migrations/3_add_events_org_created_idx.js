/**
 * Migration: 3_add_events_org_created_idx
 *
 * Adds a composite index on (org_id, created_at DESC) on the contract_events
 * table to optimize queries fetching org events ordered by recency.
 *
 * Fixes issue #1249: Add down-migration for 3_add_events_org_created_idx.js index.
 */

'use strict';

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createIndex('contract_events', ['org_id', { name: 'created_at', sort: 'DESC' }], {
    name: 'contract_events_org_id_created_at_idx',
    ifNotExists: true,
  });
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropIndex('contract_events', ['org_id', { name: 'created_at', sort: 'DESC' }], {
    name: 'contract_events_org_id_created_at_idx',
    ifExists: true,
  });
};
