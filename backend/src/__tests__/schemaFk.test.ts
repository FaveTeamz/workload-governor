/**
 * #1253: migration 8 adds the assignments → applications foreign key.
 * Its SQL was verified against PostgreSQL 16 (orphans moved aside, invalid
 * insert rejected with 23503, referenced delete restricted, down restores).
 * This pins the migration's shape.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const migration = require("../../../migrations/8_add_assignments_applications_fk");

function pgm() {
  return { sql: vi.fn(), addConstraint: vi.fn(), dropConstraint: vi.fn(), dropTable: vi.fn() };
}

describe("migration 8_add_assignments_applications_fk", () => {
  it("moves orphaned assignments aside, then adds a RESTRICT composite FK", () => {
    const m = pgm();
    migration.up(m);

    const sql = m.sql.mock.calls.map((c) => c[0]).join("\n");
    expect(sql).toMatch(/CREATE TABLE assignments_orphaned/);
    expect(sql).toMatch(/DELETE FROM assignments a[\s\S]*NOT EXISTS[\s\S]*FROM applications/);
    expect(m.sql.mock.invocationCallOrder[0]).toBeLessThan(m.addConstraint.mock.invocationCallOrder[0]);

    expect(m.addConstraint).toHaveBeenCalledWith("assignments", "fk_assignments_application", {
      foreignKeys: {
        columns: ["contributor", "org_id", "issue_id"],
        references: "applications(contributor, org_id, issue_id)",
        onDelete: "RESTRICT",
      },
    });
  });

  it("down drops the constraint and restores the moved rows", () => {
    const m = pgm();
    migration.down(m);
    expect(m.dropConstraint).toHaveBeenCalledWith("assignments", "fk_assignments_application", { ifExists: true });
    expect(m.sql.mock.calls[0][0]).toMatch(/INSERT INTO assignments[\s\S]*FROM assignments_orphaned/);
    expect(m.dropTable).toHaveBeenCalledWith("assignments_orphaned");
    expect(m.dropConstraint.mock.invocationCallOrder[0]).toBeLessThan(m.sql.mock.invocationCallOrder[0]);
  });
});
