/**
 * Migration: 6_add_applications_contributor_status_idx
 *
 * Adds a composite B-Tree index on (contributor, status, created_at) on the
 * applications table to accelerate the contributor dashboard query:
 *
 *   SELECT * FROM applications
 *   WHERE contributor = $1 AND status = 'pending'
 *   ORDER BY created_at DESC
 *
 * Under large datasets (500k+ rows) PostgreSQL was performing a BitmapAnd
 * across separate single-column indexes, causing query latency above 250ms.
 * This index enables an Index Scan / Index Only Scan with sub-10ms latency.
 *
 * Implements issue #1250: Add composite index for contributor applications
 * query on (contributor, status, created_at).
 */

'use strict';

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createIndex(
    'applications',
    ['contributor', 'status', { name: 'created_at', sort: 'DESC' }],
    {
      name: 'idx_applications_contrib_status_created',
      method: 'btree',
      ifNotExists: true,
    },
  );
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropIndex(
    'applications',
    ['contributor', 'status', { name: 'created_at', sort: 'DESC' }],
    {
      name: 'idx_applications_contrib_status_created',
      ifExists: true,
    },
  );
};
