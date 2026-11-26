'use strict';

/**
 * Migration: 7_add_soft_delete_and_archive (#1252)
 *
 * Soft deletion for applications plus an archive table, so stale rows can be
 * moved out of the hot `applications` table without losing the audit trail.
 *
 *   applications.deleted_at   – set when an application is withdrawn/expired
 *                               (soft delete); live queries filter
 *                               `deleted_at IS NULL`.
 *   applications.archived_at  – stamped on the row as it is moved to the archive.
 *   applications_archive      – same columns as `applications`; filled by the
 *                               archival job (backend/src/scheduler.ts) with
 *                               rows soft-deleted more than 90 days ago.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.addColumns('applications', {
    deleted_at: { type: 'timestamptz', notNull: false },
    archived_at: { type: 'timestamptz', notNull: false },
  });

  // Small partial index: only soft-deleted rows, used by the archival sweep.
  pgm.createIndex('applications', 'deleted_at', {
    name: 'idx_applications_deleted_at',
    where: 'deleted_at IS NOT NULL',
  });

  // Same column set (and defaults) as applications, including the two new
  // columns. No primary key: an application can be archived, re-created and
  // archived again.
  pgm.sql('CREATE TABLE applications_archive (LIKE applications INCLUDING DEFAULTS)');
  pgm.createIndex('applications_archive', ['contributor', 'org_id'], {
    name: 'idx_applications_archive_contributor',
  });
  pgm.createIndex('applications_archive', 'archived_at', {
    name: 'idx_applications_archive_archived_at',
  });
};

exports.down = (pgm) => {
  // Refuse to drop archived history: copying it back would resurrect
  // withdrawn/expired applications as live rows. Export or empty
  // applications_archive first if a rollback is really intended.
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM applications_archive) THEN
        RAISE EXCEPTION 'applications_archive is not empty; export it before rolling back migration 7';
      END IF;
    END $$;
  `);
  pgm.dropTable('applications_archive');
  pgm.dropIndex('applications', 'deleted_at', { name: 'idx_applications_deleted_at', ifExists: true });
  pgm.dropColumns('applications', ['deleted_at', 'archived_at']);
};
