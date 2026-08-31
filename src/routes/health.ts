/**
 * health.ts
 *
 * GET /health — liveness + readiness probe.
 *
 * Always returns HTTP 200. The `status` field is "ok" when the DB is
 * reachable, "degraded" when it is not (so upstream health checks that only
 * inspect the status code still succeed, but alerting systems can inspect the
 * body for degraded state).
 *
 * Response shape:
 * {
 *   status:    "ok" | "degraded",
 *   timestamp: string,               // ISO-8601
 *   db: {
 *     status:  "ok" | "error",
 *     pool: {
 *       total:   number,             // total connections in the pool
 *       idle:    number,             // connections currently idle
 *       waiting: number,             // queued requests waiting for a connection
 *     }
 *   }
 * }
 *
 * Pool stats give operators visibility into connection exhaustion before
 * requests start failing (fixes issue #561).
 */

import { Router, Request, Response } from 'express';
import { getPool } from '../db';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  const pool = getPool();

  // Collect pool stats (node-postgres Pool exposes these as synchronous properties)
  const poolStats = {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };

  // Perform a lightweight connectivity check; fail-open so liveness always passes
  let dbStatus: 'ok' | 'error' = 'ok';
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  } catch {
    dbStatus = 'error';
  }

  const overallStatus = dbStatus === 'ok' ? 'ok' : 'degraded';

  // Always return HTTP 200 so upstream load-balancer health checks pass.
  // Consumers that need the DB status should inspect res.body.db.status.
  res.status(200).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    db: {
      status: dbStatus,
      pool: poolStats,
    },
  });
});

export default router;
