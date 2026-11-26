/**
 * Soft deletion and archival of applications (#1252).
 *
 * The SQL itself was verified against PostgreSQL 16; these tests pin the
 * helpers' contract (parameters, batching, idempotency) and the migration's
 * up/down shape with mocks.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "module";
import {
  ACTIVE_APPLICATION_FILTER,
  ARCHIVE_AFTER_DAYS,
  archiveBatch,
  archiveStaleApplications,
  restoreApplication,
  softDeleteApplication,
  type Queryable,
} from "../applicationRetention";

const key = { contributor: "GABC", org_id: "org_1", issue_id: 42 };

function db(...rowCounts: number[]): Queryable & { query: ReturnType<typeof vi.fn> } {
  const query = vi.fn();
  for (const rowCount of rowCounts) query.mockResolvedValueOnce({ rows: [], rowCount });
  return { query };
}

describe("soft delete", () => {
  it("only soft-deletes live rows and reports whether one changed", async () => {
    const d = db(1, 0);
    expect(await softDeleteApplication(d, key)).toBe(true);
    expect(await softDeleteApplication(d, key)).toBe(false);
    const [sql, params] = d.query.mock.calls[0];
    expect(sql).toMatch(/SET deleted_at = NOW\(\)/);
    expect(sql).toMatch(/AND deleted_at IS NULL/);
    expect(params).toEqual(["GABC", "org_1", 42]);
  });

  it("restores a soft-deleted row", async () => {
    const d = db(1);
    expect(await restoreApplication(d, key)).toBe(true);
    expect(d.query.mock.calls[0][0]).toMatch(/SET deleted_at = NULL[\s\S]*deleted_at IS NOT NULL/);
  });

  it("exposes the predicate live queries must use", () => {
    expect(ACTIVE_APPLICATION_FILTER).toBe("deleted_at IS NULL");
  });
});

describe("archival", () => {
  it("moves one batch of rows older than the cutoff without blocking live writers", async () => {
    const d = db(7);
    expect(await archiveBatch(d, 90, 500)).toBe(7);
    const [sql, params] = d.query.mock.calls[0];
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(sql).toMatch(/DELETE FROM applications/);
    expect(sql).toMatch(/INSERT INTO applications_archive[\s\S]*archived_at/);
    expect(params).toEqual([90, 500]);
  });

  it("uses a 90-day cutoff by default", async () => {
    const d = db(0);
    await archiveStaleApplications(d);
    expect(ARCHIVE_AFTER_DAYS).toBe(90);
    expect(d.query.mock.calls[0][1][0]).toBe(90);
  });

  it("keeps sweeping until a short batch, then reports completion", async () => {
    const d = db(3, 3, 1);
    expect(await archiveStaleApplications(d, { batchSize: 3 })).toEqual({ archived: 7, batches: 3, complete: true });
  });

  it("stops after maxBatches and reports the remaining backlog", async () => {
    const d = db(2, 2, 2);
    expect(await archiveStaleApplications(d, { batchSize: 2, maxBatches: 2 })).toEqual({
      archived: 4,
      batches: 2,
      complete: false,
    });
    expect(d.query).toHaveBeenCalledTimes(2);
  });
});

describe("migration 7_add_soft_delete_and_archive", () => {
  const require = createRequire(import.meta.url);
  const migration = require("../../../migrations/7_add_soft_delete_and_archive");

  function pgm() {
    return {
      addColumns: vi.fn(),
      dropColumns: vi.fn(),
      createIndex: vi.fn(),
      dropIndex: vi.fn(),
      dropTable: vi.fn(),
      sql: vi.fn(),
    };
  }

  it("adds the soft-delete columns and the archive table", () => {
    const m = pgm();
    migration.up(m);
    expect(m.addColumns).toHaveBeenCalledWith("applications", {
      deleted_at: expect.objectContaining({ type: "timestamptz" }),
      archived_at: expect.objectContaining({ type: "timestamptz" }),
    });
    expect(m.sql).toHaveBeenCalledWith(expect.stringContaining("CREATE TABLE applications_archive (LIKE applications"));
  });

  it("down reverses up and refuses to discard archived rows", () => {
    const m = pgm();
    migration.down(m);
    expect(m.sql.mock.calls[0][0]).toMatch(/RAISE EXCEPTION 'applications_archive is not empty/);
    expect(m.dropTable).toHaveBeenCalledWith("applications_archive");
    expect(m.dropColumns).toHaveBeenCalledWith("applications", ["deleted_at", "archived_at"]);
  });
});
