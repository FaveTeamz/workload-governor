/**
 * db.ts — PostgreSQL connection pool
 *
 * Exposes a single Pool instance shared across all modules.
 * Connection parameters are read from environment variables:
 *   DATABASE_URL  (preferred, takes precedence)
 *   PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD
 *
 * Pool sizing is configurable via environment variables (issue #561):
 *   DB_POOL_MIN: minimum connections kept alive (default: 2)
 *   DB_POOL_MAX: maximum connections allowed   (default: 10)
 *   DB_IDLE_TIMEOUT: ms before idle connection is closed (default: 30000)
 *   DB_CONNECTION_TIMEOUT: ms to wait for a connection   (default: 5000)
 */

import pg from "pg";

const { Pool } = pg;

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      min: parseInt(process.env.DB_POOL_MIN ?? "2", 10),
      max: parseInt(process.env.DB_POOL_MAX ?? "10", 10),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT ?? "30000", 10),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT ?? "5000", 10),
    }
  : {
      host:     process.env.PGHOST     ?? "localhost",
      port:     parseInt(process.env.PGPORT ?? "5432", 10),
      database: process.env.PGDATABASE ?? "workload_governor",
      user:     process.env.PGUSER     ?? "postgres",
      password: process.env.PGPASSWORD ?? "",
      min: parseInt(process.env.DB_POOL_MIN ?? "2", 10),
      max: parseInt(process.env.DB_POOL_MAX ?? "10", 10),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT ?? "30000", 10),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT ?? "5000", 10),
    };

export const pool = new Pool(poolConfig);

// Log and alert on unexpected idle-client errors (fixes issue #561)
pool.on("error", (err) => {
  console.error("[db] Unexpected error on idle DB client:", err.message, err.stack);
});

export default pool;
