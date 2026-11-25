/**
 * applicationRetention.ts — soft deletion and archival of applications (#1252)
 *
 * Schema: migrations/7_add_soft_delete_and_archive.js
 *   applications.deleted_at / archived_at, applications_archive
 *
 * Every helper takes the queryable to run on (the shared pool, or a client
 * inside a transaction) so callers control transactions and tests can pass a
 * mock.
 */

export interface Queryable {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface ApplicationKey {
  contributor: string;
  org_id: string;
  issue_id: string | number;
}

/** SQL predicate every live-application query must include. */
export const ACTIVE_APPLICATION_FILTER = "deleted_at IS NULL";

/** Rows soft-deleted longer ago than this are moved to applications_archive. */
export const ARCHIVE_AFTER_DAYS = 90;

/** Rows moved per statement; small batches keep row locks short. */
export const ARCHIVE_BATCH_SIZE = 500;

/** Marks an application deleted (idempotent). Returns true when a live row was soft-deleted. */
export async function softDeleteApplication(db: Queryable, key: ApplicationKey): Promise<boolean> {
  const result = await db.query(
    `UPDATE applications
        SET deleted_at = NOW()
      WHERE contributor = $1 AND org_id = $2 AND issue_id = $3
        AND deleted_at IS NULL`,
    [key.contributor, key.org_id, key.issue_id],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Undoes a soft delete that has not been archived yet. */
export async function restoreApplication(db: Queryable, key: ApplicationKey): Promise<boolean> {
  const result = await db.query(
    `UPDATE applications
        SET deleted_at = NULL
      WHERE contributor = $1 AND org_id = $2 AND issue_id = $3
        AND deleted_at IS NOT NULL`,
    [key.contributor, key.org_id, key.issue_id],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Moves one batch of rows soft-deleted more than `olderThanDays` ago into
 * applications_archive (stamping archived_at) and removes them from
 * applications, in a single statement. `FOR UPDATE SKIP LOCKED` means live
 * writers are never blocked and concurrent sweeps never move the same row.
 * Returns the number of rows moved.
 */
export async function archiveBatch(
  db: Queryable,
  olderThanDays: number = ARCHIVE_AFTER_DAYS,
  batchSize: number = ARCHIVE_BATCH_SIZE,
): Promise<number> {
  const result = await db.query(
    `WITH doomed AS (
       SELECT ctid
         FROM applications
        WHERE deleted_at IS NOT NULL
          AND deleted_at < NOW() - make_interval(days => $1)
        LIMIT $2
        FOR UPDATE SKIP LOCKED
     ),
     moved AS (
       DELETE FROM applications a
        USING doomed
        WHERE a.ctid = doomed.ctid
       RETURNING a.contributor, a.org_id, a.issue_id, a.created_at, a.deleted_at
     )
     INSERT INTO applications_archive (contributor, org_id, issue_id, created_at, deleted_at, archived_at)
     SELECT contributor, org_id, issue_id, created_at, deleted_at, NOW()
       FROM moved`,
    [olderThanDays, batchSize],
  );
  return result.rowCount ?? 0;
}

/**
 * Archives every eligible row, one short batch at a time, stopping after
 * `maxBatches` so a huge backlog is spread over several scheduled runs.
 */
export async function archiveStaleApplications(
  db: Queryable,
  { olderThanDays = ARCHIVE_AFTER_DAYS, batchSize = ARCHIVE_BATCH_SIZE, maxBatches = 200 } = {},
): Promise<{ archived: number; batches: number; complete: boolean }> {
  let archived = 0;
  let batches = 0;
  while (batches < maxBatches) {
    const moved = await archiveBatch(db, olderThanDays, batchSize);
    batches++;
    archived += moved;
    if (moved < batchSize) return { archived, batches, complete: true };
  }
  return { archived, batches, complete: false };
}
