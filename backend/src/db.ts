/**
 * db.ts — PostgreSQL connection pool
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
 * Query correlation (#1234):
 *   taggedQuery() prepends a SQL comment /* reqId: <id> *\/ to every query so
 *   that the correlation ID appears in PostgreSQL slow-query logs and pg_stat_activity.
 */

import pg, { PoolClient } from "pg";
import logger from "./logger.js";
import { getRequestId } from "./tracing.js";

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
      logger.warn(
        {
          durationMs: duration,
          thresholdMs: SLOW_ACQUIRE_THRESHOLD_MS,
          pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
        },
        "[db] Slow connection acquisition detected",
      );
    }
    return client;
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logger.error(
      {
        durationMs: duration,
        err: err.message,
        pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
      },
      "[db] Connection acquire failed",
    );
    throw err;
  }
};

// Log and alert on unexpected idle-client errors and clean up (fixes #561, #860)
pool.on("error", (err: Error, client?: any) => {
  logger.error({ err: err.message, stack: err.stack }, "[db] Unexpected error on idle DB client");
  if (client) {
    try {
      client.release?.(true); // destroy client on fatal error
    } catch {
      // ignore
    }
  }
});

export default pool;

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
