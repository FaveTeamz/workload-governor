/**
 * #1256: primary write-capability and read-replica probes for /api/health and
 * /api/ready.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));

vi.mock("../db.js", () => ({
  default: { query: poolQuery, totalCount: 1, idleCount: 1, waitingCount: 0 },
  getReplicaPool: () => null,
}));
vi.mock("../soroban.js", () => ({ getLatestLedger: vi.fn().mockResolvedValue(1) }));
vi.mock("../logger.js", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("ioredis", () => ({ default: vi.fn() }));

import { checkPrimaryDatabase, checkReplicaDatabase, readyHandler, type Queryable } from "../health.js";

const stub = (row: Record<string, unknown> | Error): Queryable => ({
  query: vi.fn(async () => {
    if (row instanceof Error) throw row;
    return { rows: [row] };
  }),
});

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return res;
}

describe("checkPrimaryDatabase", () => {
  it("is up and writable on a read-write primary", async () => {
    const result = await checkPrimaryDatabase(stub({ in_recovery: false, read_only: "off" }));
    expect(result).toMatchObject({ status: "up", writable: true });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("is up but not writable on a standby or read-only session", async () => {
    expect(await checkPrimaryDatabase(stub({ in_recovery: true, read_only: "on" }))).toMatchObject({
      status: "up",
      writable: false,
    });
    expect(await checkPrimaryDatabase(stub({ in_recovery: false, read_only: "on" }))).toMatchObject({
      writable: false,
    });
  });

  it("is down when the query fails", async () => {
    expect(await checkPrimaryDatabase(stub(new Error("connection refused")))).toMatchObject({
      status: "down",
      writable: false,
    });
  });
});

describe("checkReplicaDatabase", () => {
  it("reports replication lag for a streaming standby", async () => {
    const result = await checkReplicaDatabase(stub({ in_recovery: true, replay_lsn: "0/3000060", lag_seconds: "0.2" }));
    expect(result).toMatchObject({ status: "up", replicationLagSeconds: 0.2 });
  });

  it("is lagging beyond REPLICA_MAX_LAG_SECONDS (default 30)", async () => {
    const result = await checkReplicaDatabase(stub({ in_recovery: true, lag_seconds: 45 }));
    expect(result).toMatchObject({ status: "lagging", replicationLagSeconds: 45 });
  });

  it("is down when unreachable", async () => {
    expect(await checkReplicaDatabase(stub(new Error("timeout")))).toMatchObject({
      status: "down",
      replicationLagSeconds: null,
    });
  });
});

describe("readyHandler", () => {
  beforeEach(() => poolQuery.mockReset());

  it("returns 200 while the primary accepts writes", async () => {
    poolQuery.mockResolvedValue({ rows: [{ in_recovery: false, read_only: "off" }] });
    const res = mockRes();
    await readyHandler({} as never, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ status: "ready", database: { primary: { writable: true } } });
  });

  it("returns 503 when the primary is not writable (e.g. failed over to a standby)", async () => {
    poolQuery.mockResolvedValue({ rows: [{ in_recovery: true, read_only: "on" }] });
    const res = mockRes();
    await readyHandler({} as never, res as never);
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ status: "not_ready" });
  });
});
