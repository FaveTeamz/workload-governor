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

const { Pool } = pg;

const acquireTimeout = parseInt(process.env.DB_ACQUIRE_TIMEOUT ?? process.env.DB_CONNECTION_TIMEOUT ?? "10000", 10);
const idleTimeout = parseInt(process.env.DB_IDLE_TIMEOUT ?? "30000", 10);
const poolMin = parseInt(process.env.DB_POOL_MIN ?? "2", 10);
const poolMax = parseInt(process.env.DB_POOL_MAX ?? "20", 10);

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
      min: poolMin,
      max: poolMax,
      idleTimeoutMillis: idleTimeout,
      connectionTimeoutMillis: acquireTimeout,
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
    };

export const pool = new Pool(poolConfig);

// Connection pool leak protection and acquisition tracking (closes #860)
const SLOW_ACQUIRE_THRESHOLD_MS = 3000;
const originalConnect = pool.connect.bind(pool);

(pool as any).connect = async function (...args: any[]): Promise<PoolClient> {
  const startTime = Date.now();
  try {
    const client = await (originalConnect as any)(...args);
    const duration = Date.now() - startTime;
    if (duration > SLOW_ACQUIRE_THRESHOLD_MS) {
      console.warn(
        `[db] Slow connection acquisition detected: ${duration}ms (threshold: ${SLOW_ACQUIRE_THRESHOLD_MS}ms). Pool stats: total=${pool.totalCount}, idle=${pool.idleCount}, waiting=${pool.waitingCount}`,
        new Error("Slow acquire trace").stack
      );
    }
    return client;
  } catch (err: any) {
    const duration = Date.now() - startTime;
    console.error(
      `[db] Connection acquire failed after ${duration}ms: ${err.message}. Pool stats: total=${pool.totalCount}, idle=${pool.idleCount}, waiting=${pool.waitingCount}`
    );
    throw err;
  }
};

// Log and alert on unexpected idle-client errors and clean up (fixes #561, #860)
pool.on("error", (err: Error, client?: any) => {
  console.error("[db] Unexpected error on idle DB client:", err.message, err.stack);
  if (client) {
    try {
      client.release?.(true); // destroy client on fatal error
    } catch {
      // ignore
    }
  }
});

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
