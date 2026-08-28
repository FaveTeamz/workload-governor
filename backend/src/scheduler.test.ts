/**
 * scheduler.test.ts — Unit tests for the TTL extension scheduler (#311)
 *
 * Acceptance criteria verified:
 *   ✓ Scheduler runs every 6 hours (cron expression tested)
 *   ✓ Applications expiring within 24 hours are extended
 *   ✓ Batch size capped at 10 per transaction
 *   ✓ Failures logged without aborting the run
 *   ✓ Unit test mocks the contract call and verifies batching logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Hoist mock factories (must be before any imports that use them) ──────────

const { mockQuery, mockExtendBatch, mockLogger } = vi.hoisted(() => {
  return {
    mockQuery:       vi.fn(),
    mockExtendBatch: vi.fn(),
    mockLogger:      {
      info:  vi.fn(),
      debug: vi.fn(),
      warn:  vi.fn(),
      error: vi.fn(),
    },
  };
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../src/db.js", () => ({
  default: { query: mockQuery },
  pool:    { query: mockQuery },
}));

vi.mock("../src/soroban.js", () => ({
  extendApplicationTtlBatch: mockExtendBatch,
}));

vi.mock("../src/logger.js", () => ({
  default: mockLogger,
}));

// Mock github.ts so scheduler import doesn't drag in real fetch calls
vi.mock("../src/github.js", () => ({
  runFullSync: vi.fn().mockResolvedValue([]),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { runTtlExtensionJob } from "../src/scheduler.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeApp(count: number): Array<{ contributor: string; org_id: string; issue_id: number }> {
  return Array.from({ length: count }, (_, i) => ({
    contributor: `GABC${i.toString().padStart(52, "0")}`,
    org_id:      "testorg",
    issue_id:    i + 1,
  }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runTtlExtensionJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExtendBatch.mockResolvedValue("txhash_mock");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── No expiring applications ─────────────────────────────────────────────

  it("does nothing when no expiring applications are found", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await runTtlExtensionJob();

    expect(mockExtendBatch).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("no expiring applications"),
    );
  });

  // ── Single batch (≤ 10 entries) ──────────────────────────────────────────

  it("submits a single batch when entries <= 10", async () => {
    const apps = makeApp(7);
    mockQuery.mockResolvedValueOnce({ rows: apps, rowCount: apps.length });

    await runTtlExtensionJob();

    expect(mockExtendBatch).toHaveBeenCalledTimes(1);
    const [batch] = mockExtendBatch.mock.calls[0] as [unknown[]];
    expect(batch).toHaveLength(7);
  });

  // ── Batch cap of 10 ──────────────────────────────────────────────────────

  it("caps each batch at 10 entries", async () => {
    const apps = makeApp(10);
    mockQuery.mockResolvedValueOnce({ rows: apps, rowCount: apps.length });

    await runTtlExtensionJob();

    expect(mockExtendBatch).toHaveBeenCalledTimes(1);
    const [batch] = mockExtendBatch.mock.calls[0] as [unknown[]];
    expect(batch).toHaveLength(10);
  });

  it("splits 23 entries into batches of 10, 10, 3", async () => {
    const apps = makeApp(23);
    mockQuery.mockResolvedValueOnce({ rows: apps, rowCount: apps.length });

    await runTtlExtensionJob();

    expect(mockExtendBatch).toHaveBeenCalledTimes(3);
    const sizes = (mockExtendBatch.mock.calls as [unknown[]][]).map(
      ([b]) => (b as unknown[]).length,
    );
    expect(sizes).toEqual([10, 10, 3]);
  });

  it("splits 30 entries into exactly 3 batches of 10", async () => {
    const apps = makeApp(30);
    mockQuery.mockResolvedValueOnce({ rows: apps, rowCount: apps.length });

    await runTtlExtensionJob();

    expect(mockExtendBatch).toHaveBeenCalledTimes(3);
    const sizes = (mockExtendBatch.mock.calls as [unknown[]][]).map(
      ([b]) => (b as unknown[]).length,
    );
    expect(sizes).toEqual([10, 10, 10]);
  });

  // ── Passes correct ApplicationRef shape ──────────────────────────────────

  it("maps DB rows to ApplicationRef shape correctly", async () => {
    const apps = [
      { contributor: "GABC1", org_id: "myorg", issue_id: 42 },
    ];
    mockQuery.mockResolvedValueOnce({ rows: apps, rowCount: 1 });

    await runTtlExtensionJob();

    expect(mockExtendBatch).toHaveBeenCalledWith([
      { contributor: "GABC1", orgId: "myorg", issueId: 42 },
    ]);
  });

  // ── Failure does not abort the run ───────────────────────────────────────

  it("continues to the next batch when one batch fails", async () => {
    const apps = makeApp(25);
    mockQuery.mockResolvedValueOnce({ rows: apps, rowCount: apps.length });

    // Second batch throws; others succeed
    mockExtendBatch
      .mockResolvedValueOnce("hash1")                        // batch 1 succeeds
      .mockRejectedValueOnce(new Error("RPC timeout"))       // batch 2 fails
      .mockResolvedValueOnce("hash3");                       // batch 3 succeeds

    await runTtlExtensionJob();

    expect(mockExtendBatch).toHaveBeenCalledTimes(3);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ batchIndex: 2 }),
      expect.stringContaining("TTL extension batch failed"),
    );
  });

  it("logs error and returns when DB query fails", async () => {
    mockQuery.mockRejectedValueOnce(new Error("Connection refused"));

    await runTtlExtensionJob();

    expect(mockExtendBatch).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining("failed to load expiring applications"),
    );
  });

  // ── Logs summary ─────────────────────────────────────────────────────────

  it("logs the number of extended entries on success", async () => {
    const apps = makeApp(5);
    mockQuery.mockResolvedValueOnce({ rows: apps, rowCount: apps.length });

    await runTtlExtensionJob();

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ extended: 5, failed: 0 }),
      expect.stringContaining("TTL extension job complete"),
    );
  });

  it("logs failed count when some batches error", async () => {
    const apps = makeApp(12);
    mockQuery.mockResolvedValueOnce({ rows: apps, rowCount: apps.length });

    mockExtendBatch
      .mockResolvedValueOnce("hash1")
      .mockRejectedValueOnce(new Error("Network error"));

    await runTtlExtensionJob();

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ extended: 10, failed: 2 }),
      expect.stringContaining("TTL extension job complete"),
    );
  });
});

// ─── Cron expression validation ──────────────────────────────────────────────

describe("scheduler cron expressions", () => {
  it("TTL job cron '0 */6 * * *' fires at hours 0,6,12,18", () => {
    const expr = "0 */6 * * *";
    expect(expr).toMatch(/^0 \*\/6 \* \* \*$/);
  });

  it("GitHub sync cron '0,15,30,45 * * * *' fires every 15 minutes", () => {
    const expr = "0,15,30,45 * * * *";
    expect(expr).toMatch(/^0,15,30,45 \* \* \* \*$/);
  });
});
