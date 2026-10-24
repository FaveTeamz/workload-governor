/**
 * Benchmark tests for leaderboard query endpoints.
 *
 * Uses EXPLAIN (ANALYZE, BUFFERS) to capture real query execution plans
 * against a synthetic dataset of 100,000 rows and asserts that the total
 * planner cost remains below an acceptable threshold.
 *
 * These tests require a live PostgreSQL instance and are skipped automatically
 * when DATABASE_URL is not set (e.g. in unit-only CI jobs).
 */

import { Pool } from 'pg';

const DATABASE_URL = process.env['DATABASE_URL'];
const SKIP = !DATABASE_URL;

// Total-cost threshold for the leaderboard aggregation query.
// Chosen to be achievable with the indexes defined in db.ts migrations.
const COST_THRESHOLD = 50_000;

// Number of synthetic rows to insert for benchmarking.
const ROW_COUNT = 100_000;

let pool: Pool;

beforeAll(async () => {
  if (SKIP) return;

  pool = new Pool({ connectionString: DATABASE_URL });

  // Create a dedicated benchmark schema to avoid polluting the main schema.
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS bench_leaderboard;

    CREATE TABLE IF NOT EXISTS bench_leaderboard.contract_events (
      id          SERIAL PRIMARY KEY,
      event_type  TEXT        NOT NULL,
      contributor TEXT,
      org_id      TEXT,
      issue_id    INTEGER,
      tx_hash     TEXT        NOT NULL,
      event_index INTEGER     NOT NULL DEFAULT 0,
      ledger_seq  INTEGER     NOT NULL,
      timestamp   TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tx_hash, event_index)
    );

    CREATE INDEX IF NOT EXISTS bench_idx_contract_events_contributor
      ON bench_leaderboard.contract_events(contributor);

    CREATE INDEX IF NOT EXISTS bench_idx_contract_events_timestamp
      ON bench_leaderboard.contract_events(timestamp DESC);
  `);

  // Populate with ${ROW_COUNT} synthetic rows spread across 1 000 contributors
  // and 10 orgs so the GROUP BY aggregation exercises real work.
  await pool.query(`
    INSERT INTO bench_leaderboard.contract_events
      (event_type, contributor, org_id, issue_id, tx_hash, event_index, ledger_seq, timestamp)
    SELECT
      CASE (i % 5)
        WHEN 0 THEN 'completed'
        WHEN 1 THEN 'applied'
        WHEN 2 THEN 'assigned'
        WHEN 3 THEN 'withdrawn'
        ELSE       'revoked'
      END                                                AS event_type,
      'contributor_' || (i % 1000)                       AS contributor,
      'org_'         || (i % 10)                         AS org_id,
      (i % 500)                                          AS issue_id,
      'txhash_bench_' || i                               AS tx_hash,
      0                                                  AS event_index,
      1000 + i                                           AS ledger_seq,
      NOW() - ((i % 90) || ' days')::INTERVAL            AS timestamp
    FROM generate_series(1, ${ROW_COUNT}) AS s(i)
    ON CONFLICT (tx_hash, event_index) DO NOTHING;
  `);

  // Refresh statistics so EXPLAIN ANALYZE uses accurate row estimates.
  await pool.query('ANALYZE bench_leaderboard.contract_events;');
});

afterAll(async () => {
  if (SKIP || !pool) return;
  await pool.query('DROP SCHEMA IF EXISTS bench_leaderboard CASCADE;');
  await pool.end();
});

/**
 * Parse the top-level "total cost" from an EXPLAIN output line.
 *
 * EXPLAIN lines look like:
 *   "Seq Scan on contract_events  (cost=0.00..1234.56 rows=100 width=32) …"
 * The total cost is the second number after "cost=".
 */
function extractTotalCost(explainRows: Array<{ 'QUERY PLAN': string }>): number {
  for (const row of explainRows) {
    const match = row['QUERY PLAN'].match(/cost=[\d.]+\.\.([\d.]+)/);
    if (match) {
      return parseFloat(match[1]);
    }
  }
  return Infinity;
}

// ---------------------------------------------------------------------------
// Benchmark: full leaderboard aggregation (no filters)
// ---------------------------------------------------------------------------

(SKIP ? describe.skip : describe)(
  'bench: leaderboard query EXPLAIN ANALYZE',
  () => {
    it(
      `aggregates ${ROW_COUNT} rows with cost below ${COST_THRESHOLD}`,
      async () => {
        const result = await pool.query<{ 'QUERY PLAN': string }>(`
          EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
          SELECT
            contributor,
            org_id,
            COUNT(*) AS completed_count
          FROM bench_leaderboard.contract_events
          WHERE event_type = 'completed'
          GROUP BY contributor, org_id
          ORDER BY completed_count DESC
          LIMIT 20
        `);

        const totalCost = extractTotalCost(result.rows);

        // Emit the full plan to stdout so it is captured by CI logs.
        console.log(
          '[bench] leaderboard (no filter) EXPLAIN plan:\n',
          result.rows.map((r) => r['QUERY PLAN']).join('\n'),
        );
        console.log(`[bench] total cost: ${totalCost}`);

        expect(totalCost).toBeLessThan(COST_THRESHOLD);
      },
      60_000, // allow up to 60 s for the first run
    );

    it(
      `filters by org_id with cost below ${COST_THRESHOLD}`,
      async () => {
        const result = await pool.query<{ 'QUERY PLAN': string }>(`
          EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
          SELECT
            contributor,
            org_id,
            COUNT(*) AS completed_count
          FROM bench_leaderboard.contract_events
          WHERE event_type = 'completed'
            AND org_id = 'org_1'
          GROUP BY contributor, org_id
          ORDER BY completed_count DESC
          LIMIT 20
        `);

        const totalCost = extractTotalCost(result.rows);

        console.log(
          '[bench] leaderboard (org_id filter) EXPLAIN plan:\n',
          result.rows.map((r) => r['QUERY PLAN']).join('\n'),
        );
        console.log(`[bench] total cost: ${totalCost}`);

        expect(totalCost).toBeLessThan(COST_THRESHOLD);
      },
      60_000,
    );

    it(
      `filters by timeframe (last 7 days) with cost below ${COST_THRESHOLD}`,
      async () => {
        const result = await pool.query<{ 'QUERY PLAN': string }>(`
          EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
          SELECT
            contributor,
            org_id,
            COUNT(*) AS completed_count
          FROM bench_leaderboard.contract_events
          WHERE event_type = 'completed'
            AND timestamp >= NOW() - INTERVAL '7 days'
          GROUP BY contributor, org_id
          ORDER BY completed_count DESC
          LIMIT 20
        `);

        const totalCost = extractTotalCost(result.rows);

        console.log(
          '[bench] leaderboard (7-day window) EXPLAIN plan:\n',
          result.rows.map((r) => r['QUERY PLAN']).join('\n'),
        );
        console.log(`[bench] total cost: ${totalCost}`);

        expect(totalCost).toBeLessThan(COST_THRESHOLD);
      },
      60_000,
    );

    it(
      `filters by timeframe (last 30 days) with cost below ${COST_THRESHOLD}`,
      async () => {
        const result = await pool.query<{ 'QUERY PLAN': string }>(`
          EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
          SELECT
            contributor,
            org_id,
            COUNT(*) AS completed_count
          FROM bench_leaderboard.contract_events
          WHERE event_type = 'completed'
            AND timestamp >= NOW() - INTERVAL '30 days'
          GROUP BY contributor, org_id
          ORDER BY completed_count DESC
          LIMIT 20
        `);

        const totalCost = extractTotalCost(result.rows);

        console.log(
          '[bench] leaderboard (30-day window) EXPLAIN plan:\n',
          result.rows.map((r) => r['QUERY PLAN']).join('\n'),
        );
        console.log(`[bench] total cost: ${totalCost}`);

        expect(totalCost).toBeLessThan(COST_THRESHOLD);
      },
      60_000,
    );
  },
);
