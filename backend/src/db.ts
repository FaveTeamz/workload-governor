/**
 * db.ts — PostgreSQL connection pool
 *
 * Exposes a single Pool instance shared across all modules.
 * Connection parameters are read from environment variables:
 *   DATABASE_URL  (preferred, takes precedence)
 *   PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD
 */

import pg from "pg";

const { Pool } = pg;

export const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host:     process.env.PGHOST     ?? "localhost",
        port:     parseInt(process.env.PGPORT ?? "5432", 10),
        database: process.env.PGDATABASE ?? "workload_governor",
        user:     process.env.PGUSER     ?? "postgres",
        password: process.env.PGPASSWORD ?? "",
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      },
);

export default pool;
