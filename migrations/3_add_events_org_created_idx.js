/**
 * Migration: 3_add_events_org_created_idx
 *
 * Adds a composite index on (org_id, created_at DESC) on the events table
 * to optimize queries fetching org events ordered by recency.
 *
 * Fixes issue #858: [DB-001] Composite index on events table for org_id and created_at query optimization.
 */

'use strict';

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createIndex('events', ['org_id', { name: 'created_at', sort: 'DESC' }], {
    name: 'idx_events_org_created',
    ifNotExists: true,
  });
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropIndex('events', ['org_id', { name: 'created_at', sort: 'DESC' }], {
    name: 'idx_events_org_created',
    ifExists: true,
  });
};
