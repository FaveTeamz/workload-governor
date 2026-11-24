/**
 * Migration: 3_applications_cursor_pagination
 *
 * Adds a surrogate `id` (BIGSERIAL) and a `status` column to the
 * `applications` table to support cursor-based pagination and status
 * filtering on GET /api/v1/contributors/:address/applications.
 *
 * The composite primary key (contributor, org_id, issue_id) is retained.
 * The new `id` column is unique and monotonically increasing, making it
 * safe to use as a stable pagination cursor:
 *
 *   WHERE contributor = $1 [AND id > $cursor] [AND status = $status]
 *   ORDER BY id ASC
 *   LIMIT $limit
 *
 * Status values: 'pending' (default), 'assigned', 'withdrawn', 'completed'.
 *
 * Fixes: API-002 — cursor-based pagination and status filtering.
 */

'use strict';

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Add surrogate auto-increment id for stable cursor pagination
  pgm.addColumn('applications', {
    id: {
      type: 'bigserial',
      notNull: true,
    },
  });

  // Add a unique constraint so the id can act as an unambiguous cursor
  pgm.addConstraint('applications', 'applications_id_unique', 'UNIQUE (id)');

  // Add application lifecycle status column
  pgm.addColumn('applications', {
    status: {
      type: 'text',
      notNull: true,
      default: "'pending'",
    },
  });

  // Index for cursor-scan: contributor + id (covers the paginated query)
  pgm.createIndex('applications', ['contributor', 'id'], {
    name: 'idx_applications_contributor_id',
  });

  // Index for status-filtered queries
  pgm.createIndex('applications', ['contributor', 'status', 'id'], {
    name: 'idx_applications_contributor_status_id',
  });
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropIndex('applications', ['contributor', 'status', 'id'], {
    name: 'idx_applications_contributor_status_id',
    ifExists: true,
  });
  pgm.dropIndex('applications', ['contributor', 'id'], {
    name: 'idx_applications_contributor_id',
    ifExists: true,
  });
  pgm.dropConstraint('applications', 'applications_id_unique', { ifExists: true });
  pgm.dropColumn('applications', 'status');
  pgm.dropColumn('applications', 'id');
};
