'use strict';

/**
 * Migration: 5_leaderboard_completed_idx (#1254)
 *
 * Partial covering index for the leaderboard aggregation
 * (src/routes/leaderboard.ts → buildLeaderboardQuery). The query only counts
 * `completed` events grouped by (contributor, org_id), optionally filtered by
 * org and a timestamp window, so this index lets PostgreSQL answer it without
 * a sequential scan of contract_events. Guarded by
 * tests/perf/leaderboardQuery.test.ts.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createIndex('contract_events', ['contributor', 'org_id', 'timestamp'], {
    name: 'idx_contract_events_completed_contributor',
    where: "event_type = 'completed'",
    ifNotExists: true,
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('contract_events', ['contributor', 'org_id', 'timestamp'], {
    name: 'idx_contract_events_completed_contributor',
    ifExists: true,
  });
};
