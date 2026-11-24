/**
 * db.ts — PostgreSQL connection pool
 *
 * Exposes a single Pool instance shared across all modules.
 * Connection parameters are read from environment variables:
 *   DATABASE_URL  (preferred, takes precedence)
 *   PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD
 *
 * Pool sizing and lifecycle are configurable via environment variables
 * (issues #561, #860, #1251):
 *   DB_POOL_MIN:          minimum connections kept alive (default: 4)
 *   DB_POOL_MAX:          maximum connections allowed   (default: 20)
 *   DB_IDLE_TIMEOUT:      ms before an idle connection is closed (default: 30000)
 *   DB_ACQUIRE_TIMEOUT:   ms to wait for a connection before failing (default: 5000)
 *   DB_MAX_LIFETIME_SEC:  seconds before a connection is recycled (default: 1800)
 *
 * Pool metrics are exported for Prometheus scraping via getPoolMetrics().
 */

import pg, { type PoolClient } from "pg";
import logger from "./logger.js";

const { Pool } = pg;

const acquireTimeout  = parseInt(process.env.DB_ACQUIRE_TIMEOUT  ?? process.env.DB_CONNECTION_TIMEOUT ?? "5000",  10);
const idleTimeout     = parseInt(process.env.DB_IDLE_TIMEOUT     ?? "30000", 10);
const poolMin         = parseInt(process.env.DB_POOL_MIN         ?? "4",     10);
const poolMax         = parseInt(process.env.DB_POOL_MAX         ?? "20",    10);
const maxLifetimeSec  = parseInt(process.env.DB_MAX_LIFETIME_SEC ?? "1800",  10);

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
      min: poolMin,
      max: poolMax,
      idleTimeoutMillis: idleTimeout,
      connectionTimeoutMillis: acquireTimeout,
      maxLifetimeSeconds: maxLifetimeSec,
    }
  : {
      host:     process.env.PGHOST     ?? "localhost",
      port:     parseInt(process.env.PGPORT ?? "5432", 10),
      database: process.env.PGDATABASE ?? "workload_governor",
      user:     process.env.PGUSER     ?? "postgres",
      password: process.env.PGPASSWORD ?? "",
      min: poolMin,
      max: poolMax,
      idleTimeoutMillis: idleTimeout,
      connectionTimeoutMillis: acquireTimeout,
      maxLifetimeSeconds: maxLifetimeSec,
    };

export const pool = new Pool(poolConfig);

// ─── Slow-acquire tracking (closes #860) ─────────────────────────────────────

const SLOW_ACQUIRE_THRESHOLD_MS = 3000;
const originalConnect = pool.connect.bind(pool);

(pool as any).connect = async function (...args: any[]): Promise<PoolClient> {
  const startTime = Date.now();
  try {
    const client = await (originalConnect as any)(...args);
    const duration = Date.now() - startTime;
    if (duration > SLOW_ACQUIRE_THRESHOLD_MS) {
      logger.warn(
        {
          duration_ms: duration,
          threshold_ms: SLOW_ACQUIRE_THRESHOLD_MS,
          pool: getPoolMetrics(),
        },
        "[db] Slow connection acquisition detected",
      );
    }
    return client;
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logger.error(
      { err, duration_ms: duration, pool: getPoolMetrics() },
      "[db] Connection acquire failed",
    );
    throw err;
  }
};

// ─── Idle-client error handler (fixes #561, #860, #1251) ─────────────────────

pool.on("error", (err: Error, client?: any) => {
  logger.error({ err }, "[db] Unexpected error on idle DB client");
  if (client) {
    try {
      client.release?.(true); // destroy the client so the pool allocates a fresh one
    } catch {
      // ignore secondary errors during cleanup
    }
  }
});

// ─── Pool metrics (implements #1251) ─────────────────────────────────────────

export interface PoolMetrics {
  /** Total connections currently managed by the pool (active + idle) */
  totalCount: number;
  /** Connections sitting idle, ready to be acquired */
  idleCount: number;
  /** Callers waiting for a connection to become available */
  waitingCount: number;
}

/**
 * Returns a snapshot of the current connection pool state.
 * Export these values to Prometheus by calling getPoolMetrics() inside your
 * metrics handler:
 *
 *   gauge.set({ pool: 'primary' }, getPoolMetrics().totalCount);
 */
export function getPoolMetrics(): PoolMetrics {
  return {
    totalCount:   pool.totalCount,
    idleCount:    pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

export default pool;

export async function migrate(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  const { default: pgMigrateRun } = await import("node-pg-migrate");
  await pgMigrateRun({
    direction: "up",
    databaseUrl,
    migrationsTable: "pgmigrations",
    dir: "migrations",
  });
}
