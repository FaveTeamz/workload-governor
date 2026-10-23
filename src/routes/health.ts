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
 *   }
 * }
 *
 * HTTP status:
 *   200 — DB healthy (latency < 2000ms)
 *   503 — DB unhealthy (connection failure) or degraded (latency >= 2000ms)
 *
 * Pool stats give operators visibility into connection exhaustion before
 * requests start failing (issue #561). DB latency measurement added per
 * issue #862.
 */

import { Router, Request, Response } from 'express';
import { getPool } from '../db';

const router = Router();

/** Latency threshold in ms above which the DB is considered degraded */
const DB_LATENCY_DEGRADED_MS = 2_000;

router.get('/health', async (_req: Request, res: Response) => {
  const pool = getPool();

  // Collect pool stats (node-postgres Pool exposes these as synchronous properties)
  const poolStats = {
    active:  pool.totalCount - pool.idleCount,
    idle:    pool.idleCount,
    waiting: pool.waitingCount,
  };

  // Measure SELECT 1 round-trip latency and determine DB status
  let dbStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  let latency_ms = 0;

  const start = Date.now();
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
    latency_ms = Date.now() - start;

    if (latency_ms >= DB_LATENCY_DEGRADED_MS) {
      dbStatus = 'degraded';
    }
  } catch {
    latency_ms = Date.now() - start;
    dbStatus = 'unhealthy';
  }

  const isHealthy = dbStatus === 'healthy';
  const overallStatus = isHealthy ? 'ok' : 'degraded';

  // Return HTTP 503 when DB is disconnected or latency exceeds threshold.
  // Load-balancer health checks that only look at the status code will
  // receive 503 and stop routing traffic to unhealthy instances.
  const httpStatus = dbStatus === 'unhealthy' || dbStatus === 'degraded' ? 503 : 200;

  res.status(httpStatus).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    db: {
      status: dbStatus,
      latency_ms,
      pool: poolStats,
    },
  });
});

export default router;
