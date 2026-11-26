'use strict';

/**
 * Migration: 8_add_assignments_applications_fk (#1253)
 *
 * Every assignment must belong to an application. Both tables are keyed by
 * (contributor, org_id, issue_id), so the foreign key is composite on those
 * columns. ON DELETE RESTRICT stops an application from being deleted while an
 * assignment still points at it.
 *
 * Existing orphans (assignments with no application) would make the
 * constraint fail to validate. They are moved into `assignments_orphaned`
 * for review instead of being deleted or "fixed" by inventing applications,
 * and the down migration puts them back.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE assignments_orphaned (LIKE assignments INCLUDING DEFAULTS);
    ALTER TABLE assignments_orphaned ADD COLUMN orphaned_at timestamptz NOT NULL DEFAULT NOW();

    WITH orphans AS (
      DELETE FROM assignments a
       WHERE NOT EXISTS (
         SELECT 1 FROM applications p
          WHERE p.contributor = a.contributor
            AND p.org_id = a.org_id
            AND p.issue_id = a.issue_id
       )
      RETURNING a.*
    )
    INSERT INTO assignments_orphaned (contributor, org_id, issue_id, created_at)
    SELECT contributor, org_id, issue_id, created_at FROM orphans;
  `);

  pgm.addConstraint('assignments', 'fk_assignments_application', {
    foreignKeys: {
      columns: ['contributor', 'org_id', 'issue_id'],
      references: 'applications(contributor, org_id, issue_id)',
      onDelete: 'RESTRICT',
    },
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('assignments', 'fk_assignments_application', { ifExists: true });
  pgm.sql(`
    INSERT INTO assignments (contributor, org_id, issue_id, created_at)
    SELECT contributor, org_id, issue_id, created_at FROM assignments_orphaned
    ON CONFLICT DO NOTHING;
  `);
  pgm.dropTable('assignments_orphaned');
};
