/**
 * health.ts
 *
 * GET /health — liveness + readiness probe.
 *
 * Response shape:
 * {
 *   status:    "ok" | "degraded",
 *   timestamp: string,               // ISO-8601
 *   db: {
 *     status:    "healthy" | "degraded" | "unhealthy",
 *     latency_ms: number,            // round-trip latency for SELECT 1 in milliseconds
 *     pool: {
 *       active:  number,             // connections currently in use
 *       idle:    number,             // connections currently idle
 *       waiting: number,             // queued requests waiting for a connection
 *     }
 *   },
 *   read_replica: {
 *     status:         "healthy" | "degraded" | "unhealthy" | "unconfigured",
 *     latency_ms:     number,        // round-trip SELECT 1 latency on the replica
 *     replication_lag_bytes: number | null,  // pg_wal_lsn_diff bytes behind primary
 *   }
 * }
 *
 * HTTP status:
 *   200 — primary DB healthy and replica healthy (or replica unconfigured)
 *   503 — primary DB unhealthy/degraded, OR replica lag exceeds threshold,
 *          OR replica is unreachable
 *
 * Environment variables:
 *   DATABASE_URL          — primary (write) database connection string
 *   READ_REPLICA_URL      — read-replica connection string (optional)
 *   REPLICA_LAG_THRESHOLD_BYTES — max acceptable replication lag in bytes
 *                                 before replica is considered degraded
 *                                 (default: 50 000 000 = ~50 MB)
 *
 * Pool stats give operators visibility into connection exhaustion before
 * requests start failing (issue #561). DB latency measurement added per
 * issue #862. Read-replica probe added per issue #1040.
 */

import { Pool } from 'pg';
import { Router, Request, Response } from 'express';
import { getPool } from '../db';

const router = Router();

/** Latency threshold in ms above which the DB is considered degraded */
const DB_LATENCY_DEGRADED_MS = 2_000;

/**
 * Replication lag threshold in bytes above which the read replica is
 * considered degraded. Configurable via REPLICA_LAG_THRESHOLD_BYTES.
 * Defaults to ~50 MB.
 */
const REPLICA_LAG_THRESHOLD_BYTES = parseInt(
  process.env['REPLICA_LAG_THRESHOLD_BYTES'] ?? '50000000',
  10,
);

// ---------------------------------------------------------------------------
// Lazy read-replica pool — created once on first use, reused thereafter.
// Returns null if READ_REPLICA_URL is not configured.
// ---------------------------------------------------------------------------

let _replicaPool: Pool | null | undefined = undefined; // undefined = not yet checked

function getReplicaPool(): Pool | null {
  if (_replicaPool !== undefined) return _replicaPool;

  const url = process.env['READ_REPLICA_URL'];
  if (!url) {
    _replicaPool = null;
    return null;
  }

  _replicaPool = new Pool({
    connectionString: url,
    min: 1,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  _replicaPool.on('error', (err) => {
    console.error('[db:replica] Unexpected idle-client error:', err.message);
  });

  return _replicaPool;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DbHealthStatus = 'healthy' | 'degraded' | 'unhealthy';
type ReplicaHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unconfigured';

interface ReplicaProbeResult {
  status: ReplicaHealthStatus;
  latency_ms: number;
  replication_lag_bytes: number | null;
}

// ---------------------------------------------------------------------------
// Replica probe helper
// ---------------------------------------------------------------------------

/**
 * Probe the read replica:
 *  1. Measure SELECT 1 round-trip latency.
 *  2. Query pg_wal_lsn_diff to obtain replication lag bytes.
 *
 * Returns status:
 *  - "unconfigured"  — READ_REPLICA_URL not set
 *  - "unhealthy"     — cannot connect or query fails
 *  - "degraded"      — connected but lag exceeds REPLICA_LAG_THRESHOLD_BYTES
 *                      or SELECT 1 latency >= DB_LATENCY_DEGRADED_MS
 *  - "healthy"       — connected, low latency, lag within threshold
 */
async function probeReadReplica(): Promise<ReplicaProbeResult> {
  const replicaPool = getReplicaPool();

  if (!replicaPool) {
    return { status: 'unconfigured', latency_ms: 0, replication_lag_bytes: null };
  }

  const start = Date.now();
  let latency_ms = 0;
  let replication_lag_bytes: number | null = null;

  try {
    const client = await replicaPool.connect();
    try {
      // Measure basic connectivity latency
      await client.query('SELECT 1');
      latency_ms = Date.now() - start;

      // Query replication lag using pg_wal_lsn_diff.
      // pg_last_wal_receive_lsn() — the LSN of the latest WAL received on replica.
      // pg_last_wal_replay_lsn() — the LSN of the latest WAL replayed on replica.
      //
      // We compute bytes behind as:
      //   pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn())
      // This gives the amount of WAL received but not yet applied (replay lag).
      // A null result means the replica is caught up or not streaming.
      const lagResult = await client.query<{ lag_bytes: string | null }>(`
        SELECT
          COALESCE(
            pg_wal_lsn_diff(
              pg_last_wal_receive_lsn(),
              pg_last_wal_replay_lsn()
            ),
            0
          )::bigint AS lag_bytes
      `);

      const rawLag = lagResult.rows[0]?.lag_bytes;
      replication_lag_bytes = rawLag !== null && rawLag !== undefined
        ? parseInt(rawLag, 10)
        : 0;
    } finally {
      client.release();
    }
  } catch {
    latency_ms = Date.now() - start;
    return { status: 'unhealthy', latency_ms, replication_lag_bytes: null };
  }

  // Determine replica health status
  const lagExceeded =
    replication_lag_bytes !== null && replication_lag_bytes > REPLICA_LAG_THRESHOLD_BYTES;
  const latencyExceeded = latency_ms >= DB_LATENCY_DEGRADED_MS;

  let status: ReplicaHealthStatus = 'healthy';
  if (lagExceeded || latencyExceeded) {
    status = 'degraded';
  }

  return { status, latency_ms, replication_lag_bytes };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

router.get('/health', async (_req: Request, res: Response) => {
  const pool = getPool();

  // Collect pool stats (node-postgres Pool exposes these as synchronous properties)
  const poolStats = {
    active:  pool.totalCount - pool.idleCount,
    idle:    pool.idleCount,
    waiting: pool.waitingCount,
  };

  // Probe primary DB and read replica concurrently
  const [primaryResult, replicaProbe] = await Promise.allSettled([
    (async (): Promise<{ status: DbHealthStatus; latency_ms: number }> => {
      const start = Date.now();
      try {
        const client = await pool.connect();
        try {
          await client.query('SELECT 1');
        } finally {
          client.release();
        }
        const latency_ms = Date.now() - start;
        const status: DbHealthStatus = latency_ms >= DB_LATENCY_DEGRADED_MS
          ? 'degraded'
          : 'healthy';
        return { status, latency_ms };
      } catch {
        return { status: 'unhealthy', latency_ms: Date.now() - start };
      }
    })(),
    probeReadReplica(),
  ]);

  const dbResult = primaryResult.status === 'fulfilled'
    ? primaryResult.value
    : { status: 'unhealthy' as DbHealthStatus, latency_ms: 0 };

  const replicaResult: ReplicaProbeResult = replicaProbe.status === 'fulfilled'
    ? replicaProbe.value
    : { status: 'unhealthy', latency_ms: 0, replication_lag_bytes: null };

  // Determine overall health.
  // A 503 is returned if:
  //  - The primary DB is unhealthy or degraded
  //  - The replica is unhealthy or degraded (i.e. configured but over-threshold)
  const primaryUnhealthy = dbResult.status === 'unhealthy' || dbResult.status === 'degraded';
  const replicaUnhealthy =
    replicaResult.status === 'unhealthy' || replicaResult.status === 'degraded';

  const httpStatus = primaryUnhealthy || replicaUnhealthy ? 503 : 200;
  const overallStatus = httpStatus === 200 ? 'ok' : 'degraded';

  res.status(httpStatus).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    db: {
      status: dbResult.status,
      latency_ms: dbResult.latency_ms,
      pool: poolStats,
    },
    read_replica: {
      status: replicaResult.status,
      latency_ms: replicaResult.latency_ms,
      replication_lag_bytes: replicaResult.replication_lag_bytes,
    },
  });
});

export default router;
