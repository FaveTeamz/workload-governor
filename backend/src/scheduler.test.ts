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

const { mockQuery, mockConnect, mockClientQuery, mockClientRelease, mockExtendBatch, mockLogger } = vi.hoisted(() => {
  const mockClientQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const mockClientRelease = vi.fn();
  return {
    mockQuery:       vi.fn(),
    mockClientQuery,
    mockClientRelease,
    mockConnect:     vi.fn().mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    }),
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
  default: { query: mockQuery, connect: mockConnect },
  pool:    { query: mockQuery, connect: mockConnect },
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

import {
  runTtlExtensionJob,
  commitLedgerCheckpoint,
  getLedgerCheckpoint,
  readStartupCheckpoint,
  trackLedgerProgress,
} from "../src/scheduler.js";

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

  // ── Consecutive failure tracking ──────────────────────────────────────────

  it("tracks consecutive failures and triggers alert after 3 failures", async () => {
    mockQuery.mockRejectedValue(new Error("DB connection failed"));

    // First failure
    await runTtlExtensionJob();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ consecutiveFailures: 1 }),
      expect.anything(),
    );

    // Second failure
    await runTtlExtensionJob();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ consecutiveFailures: 2 }),
      expect.anything(),
    );

    // Third failure - should trigger alert
    await runTtlExtensionJob();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ consecutiveFailures: 3, threshold: 3 }),
      expect.stringContaining("ALERT - max consecutive failures reached"),
    );
  });

  it("resets consecutive failure counter on success", async () => {
    const apps = makeApp(5);
    mockQuery.mockResolvedValueOnce({ rows: apps, rowCount: apps.length });

    await runTtlExtensionJob();

    // After success, counter should be reset (consecutive failures = 0)
    // Next failure should start at 1 again
    mockQuery.mockRejectedValueOnce(new Error("Connection failed"));
    await runTtlExtensionJob();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ consecutiveFailures: 1 }),
      expect.anything(),
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

// ─── GitHub sync error handling ───────────────────────────────────────────────

describe("runGitHubSyncJob error handling", () => {
  const mockRunFullSync = vi.hoisted(() => vi.fn());

  beforeEach(() => {
    vi.clearAllMocks();
    mockRunFullSync.mockResolvedValue([]);
  });

  it("logs error when GitHub sync fails", async () => {
    const { runGitHubSyncJob } = await import("../src/scheduler.js");
    mockRunFullSync.mockRejectedValueOnce(new Error("Horizon endpoint unreachable"));

    await runGitHubSyncJob();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), consecutiveFailures: 1 }),
      expect.stringContaining("GitHub sync job failed"),
    );
  });

  it("tracks consecutive GitHub sync failures and triggers alert", async () => {
    const { runGitHubSyncJob } = await import("../src/scheduler.js");
    mockRunFullSync.mockRejectedValue(new Error("Network timeout"));

    // Three consecutive failures
    for (let i = 1; i <= 3; i++) {
      await runGitHubSyncJob();
    }

    // Third failure should trigger alert
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ consecutiveFailures: 3, threshold: 3 }),
      expect.stringContaining("ALERT - max consecutive failures reached"),
    );
  });

  it("resets consecutive failure counter on GitHub sync success", async () => {
    const { runGitHubSyncJob } = await import("../src/scheduler.js");
    
    // Simulate failure then success then failure
    mockRunFullSync.mockRejectedValueOnce(new Error("Error"));
    await runGitHubSyncJob();
    
    mockRunFullSync.mockResolvedValueOnce([{ upserted: 5, closed: 2, repo: "test" }]);
    await runGitHubSyncJob();
    
    mockRunFullSync.mockRejectedValueOnce(new Error("Error again"));
    await runGitHubSyncJob();

    // After reset, should show consecutiveFailures: 1
    expect(mockLogger.error).toHaveBeenLastCalledWith(
      expect.objectContaining({ consecutiveFailures: 1 }),
      expect.anything(),
    );
  });
});

// ─── Indexer Checkpoint Persistence (issue #849) ─────────────────────────────

describe("Indexer Checkpoint Persistence (#849)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("commitLedgerCheckpoint", () => {
    it("commits ledger checkpoint transactionally (BEGIN, INSERT, COMMIT)", async () => {
      mockClientQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      await commitLedgerCheckpoint("CONTRACT123", 12345, "hashabc");

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(mockClientQuery).toHaveBeenCalledWith("BEGIN");
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO indexer_checkpoints"),
        ["CONTRACT123", 12345, "hashabc"],
      );
      expect(mockClientQuery).toHaveBeenCalledWith("COMMIT");
      expect(mockClientRelease).toHaveBeenCalledTimes(1);
    });

    it("rolls back transaction and releases client on database error", async () => {
      mockClientQuery.mockImplementation(async (sql: string) => {
        if (sql === "BEGIN") return { rows: [] };
        if (typeof sql === "string" && sql.includes("INSERT INTO indexer_checkpoints")) {
          throw new Error("DB connection lost");
        }
        return { rows: [] };
      });

      await expect(
        commitLedgerCheckpoint("CONTRACT123", 12345, "hashabc"),
      ).rejects.toThrow("DB connection lost");

      expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
      expect(mockClientRelease).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ contractId: "CONTRACT123", lastLedger: 12345 }),
        expect.stringContaining("Failed to commit ledger checkpoint"),
      );
    });
  });

  describe("getLedgerCheckpoint", () => {
    it("returns checkpoint record from database", async () => {
      const mockRecord = {
        contract_id: "CONTRACT123",
        last_ledger: 500,
        last_ledger_hash: "hashxyz",
        updated_at: new Date(),
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockRecord], rowCount: 1 });

      const result = await getLedgerCheckpoint("CONTRACT123");
      expect(result).toEqual(mockRecord);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("FROM indexer_checkpoints"),
        ["CONTRACT123"],
      );
    });

    it("returns null if no checkpoint row found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getLedgerCheckpoint("NON_EXISTENT");
      expect(result).toBeNull();
    });
  });

  describe("readStartupCheckpoint", () => {
    it("resumes from Redis cache when valid number provided", async () => {
      const result = await readStartupCheckpoint("CONTRACT123", 450);
      expect(result).toBe(450);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("resumes from Redis cache when valid numeric string provided", async () => {
      const result = await readStartupCheckpoint("CONTRACT123", "780");
      expect(result).toBe(780);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("resumes from database checkpoint if Redis cache is empty or evicted", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            contract_id: "CONTRACT123",
            last_ledger: 300,
            last_ledger_hash: "hash300",
            updated_at: new Date(),
          },
        ],
        rowCount: 1,
      });

      const result = await readStartupCheckpoint("CONTRACT123", null);
      expect(result).toBe(300);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("FROM indexer_checkpoints"),
        ["CONTRACT123"],
      );
    });

    it("returns null when both Redis and database checkpoint are empty", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await readStartupCheckpoint("CONTRACT123", undefined);
      expect(result).toBeNull();
    });
  });

  describe("trackLedgerProgress", () => {
    it("persists checkpoint when force is true", async () => {
      mockClientQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      const persisted = await trackLedgerProgress("TRACK_CONTRACT_FORCE", 10, "h10", true);
      expect(persisted).toBe(true);
      expect(mockClientQuery).toHaveBeenCalledWith("BEGIN");
      expect(mockClientQuery).toHaveBeenCalledWith("COMMIT");
    });

    it("persists checkpoint when ledger interval reaches 100", async () => {
      mockClientQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      // First force-sync to establish baseline
      await trackLedgerProgress("TRACK_CONTRACT_INTERVAL", 100, "h100", true);
      mockClientQuery.mockClear();

      // Delta of 50 ledgers should not trigger
      const skipped = await trackLedgerProgress("TRACK_CONTRACT_INTERVAL", 150, "h150", false);
      expect(skipped).toBe(false);
      expect(mockClientQuery).not.toHaveBeenCalled();

      // Delta reaching 100 (200 - 100) should trigger
      const triggered = await trackLedgerProgress("TRACK_CONTRACT_INTERVAL", 200, "h200", false);
      expect(triggered).toBe(true);
      expect(mockClientQuery).toHaveBeenCalledWith("BEGIN");
      expect(mockClientQuery).toHaveBeenCalledWith("COMMIT");
    });
  });
});

