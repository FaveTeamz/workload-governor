/**
 * db.ts — PostgreSQL connection pool and Redis client
 *
 * Exposes a single Pool instance shared across all modules.
 * Connection parameters are read from environment variables:
 *   DATABASE_URL  (preferred, takes precedence)
 *   PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD
 *
 * Pool sizing is configurable via environment variables (issues #561, #860):
 *   DB_POOL_MIN: minimum connections kept alive (default: 2)
 *   DB_POOL_MAX: maximum connections allowed   (default: 20)
 *   DB_IDLE_TIMEOUT: ms before idle connection is closed (default: 30000)
 *   DB_ACQUIRE_TIMEOUT: ms to wait for a connection   (default: 10000)
 *
 * Redis client (issue #1232):
 *   REDIS_URL: Redis connection URL (default: redis://localhost:6379)
 *   Configured with exponential backoff and jitter on reconnect to prevent
 *   thundering herd during cluster restarts or ElastiCache failovers.
 */

import pg, { PoolClient } from "pg";
import Redis from "ioredis";
import logger from "./logger.js";
import { getRequestId } from "./tracing.js";

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

// ─── Redis client ─────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const REDIS_RECONNECT_MAX_DELAY_MS = 3_000;

/**
 * Shared Redis client with exponential backoff and jitter (closes #1232).
 *
 * retryStrategy caps reconnection delay at 3 s and adds up to 50 ms of random
 * jitter to spread bursts of reconnections across multiple Node.js instances
 * (prevents thundering-herd storms against ElastiCache or a restarting cluster).
 */
export const redisClient = new Redis(REDIS_URL, {
  lazyConnect: true,
  retryStrategy(times: number): number {
    const delay = Math.min(times * 100 + Math.random() * 50, REDIS_RECONNECT_MAX_DELAY_MS);
    logger.warn({ times, delayMs: Math.round(delay) }, "[redis] Reconnecting with backoff");
    return delay;
  },
});

redisClient.on("connect", () => {
  logger.info("[redis] Connection established");
});

redisClient.on("ready", () => {
  logger.info("[redis] Client ready — accepting commands");
});

redisClient.on("error", (err: Error) => {
  logger.error({ err: err.message }, "[redis] Client error");
});

redisClient.on("close", () => {
  logger.warn("[redis] Connection closed");
});

redisClient.on("reconnecting", (delay: number) => {
  logger.warn({ delayMs: delay }, "[redis] Reconnecting…");
});

redisClient.on("end", () => {
  logger.warn("[redis] Connection ended — no further reconnection attempts");
});
// ─── Correlation-tagged query helper (#1234) ──────────────────────────────────

/**
 * Execute a SQL query with a leading comment that embeds the current request's
 * correlation ID.  The comment appears verbatim in PostgreSQL slow-query logs
 * and pg_stat_activity, making it straightforward to match a database query to
 * the HTTP request that triggered it.
 *
 * Example comment prepended to the SQL:
 *   /* reqId: 550e8400-e29b-41d4-a716-446655440000 *\/
 *
 * Falls back to running the query untagged when called outside a request context
 * (e.g. from a background scheduler), so callers never need to guard the call.
 *
 * @param sql    — SQL query string (may already contain parameters as $1, $2, …)
 * @param values — Optional parameterised values array
 */
export async function taggedQuery<R extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  values?: unknown[],
): Promise<pg.QueryResult<R>> {
  const reqId = getRequestId();
  const taggedSql = reqId ? `/* reqId: ${reqId} */ ${sql}` : sql;
  return values ? pool.query<R>(taggedSql, values) : pool.query<R>(taggedSql);
}
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
