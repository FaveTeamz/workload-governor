/**
 * EXPLAIN ANALYZE regression benchmark for the leaderboard queries (#1254).
 *
 * Seeds an isolated schema with 2,000 contributors, 50,000 applications,
 * 10,000 assignments and 8,000 completions (as contract_events rows), then
 * runs `EXPLAIN (ANALYZE, COSTS, BUFFERS, FORMAT JSON)` on exactly the SQL
 * GET /api/v1/leaderboard executes (buildLeaderboardQuery) for every filter
 * combination and asserts:
 *
 *   - planner Total Cost  < LEADERBOARD_MAX_COST     (default 2000)
 *   - Actual Total Time   < LEADERBOARD_MAX_TIME_MS  (default 35 ms)
 *   - no `Seq Scan` on contract_events
 *
 * Needs a PostgreSQL instance: skipped unless DATABASE_URL is set.
 * Run with `make bench`. When BENCH_RESULTS_FILE is set, one JSON line per
 * run (commit, query, cost, time) is appended so results can be tracked
 * across commits.
 */

import { execSync } from 'child_process';
import { appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { Pool, PoolClient } from 'pg';
import { buildLeaderboardQuery, type LeaderboardQueryOptions } from '../../src/routes/leaderboard';

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

const SCHEMA = 'bench_leaderboard_perf';
const CONTRIBUTORS = 2_000;
const APPLICATIONS = 50_000;
const ASSIGNMENTS = 10_000;
const COMPLETIONS = 8_000;
const ORGS = 20;

const MAX_COST = Number(process.env.LEADERBOARD_MAX_COST ?? 2000);
const MAX_TIME_MS = Number(process.env.LEADERBOARD_MAX_TIME_MS ?? 35);

const CASES: { name: string; options: LeaderboardQueryOptions }[] = [
  { name: 'all-time', options: { timeframe: 'all' } },
  { name: 'last 30 days', options: { timeframe: 'month' } },
  { name: 'last 7 days', options: { timeframe: 'week' } },
  { name: 'single org, all-time', options: { timeframe: 'all', org_id: 'org_3' } },
  { name: 'single org, last 7 days', options: { timeframe: 'week', org_id: 'org_3' } },
  { name: 'limit 100', options: { timeframe: 'all', limit: '100' } },
];

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Total Cost': number;
  Plans?: PlanNode[];
}

function nodes(plan: PlanNode): PlanNode[] {
  return [plan, ...(plan.Plans ?? []).flatMap(nodes)];
}

function commitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

describeDb('leaderboard query plans (#1254)', () => {
  let pool: Pool;
  let client: PoolClient;
  const results: { query: string; cost: number; timeMs: number; scans: string[] }[] = [];

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    client = await pool.connect();
    await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA};`);
    // Unqualified `contract_events` in the endpoint SQL resolves to the bench copy.
    await client.query(`SET search_path TO ${SCHEMA}`);
    await client.query('SET jit = off');

    // Same table and indexes as src/db.ts + migrations/5_leaderboard_completed_idx.js.
    await client.query(`
      CREATE TABLE contract_events (
        id          SERIAL PRIMARY KEY,
        event_type  TEXT        NOT NULL,
        contributor TEXT,
        org_id      TEXT,
        issue_id    BIGINT,
        tx_hash     TEXT        NOT NULL,
        event_index INTEGER     NOT NULL DEFAULT 0,
        ledger_seq  INTEGER     NOT NULL,
        timestamp   TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tx_hash, event_index)
      );
      CREATE INDEX idx_contract_events_contributor ON contract_events(contributor);
      CREATE INDEX idx_contract_events_ledger ON contract_events(ledger_seq);
      CREATE INDEX idx_contract_events_timestamp ON contract_events(timestamp DESC);
      CREATE INDEX idx_contract_events_completed_contributor
        ON contract_events(contributor, org_id, timestamp)
        WHERE event_type = 'completed';
    `);

    const seed = (eventType: string, count: number, offset: number) =>
      client.query(
        `INSERT INTO contract_events
           (event_type, contributor, org_id, issue_id, tx_hash, ledger_seq, timestamp)
         SELECT $1,
                'G' || lpad(((i * 7919) % $2)::text, 55, '0'),
                'org_' || (i % $3),
                i,
                $1 || '_' || i,
                $4 + i,
                NOW() - ((i % 120) || ' days')::interval - ((i % 86400) || ' seconds')::interval
           FROM generate_series(1, $5) AS s(i)`,
        [eventType, CONTRIBUTORS, ORGS, offset, count],
      );
    await seed('applied', APPLICATIONS, 0);
    await seed('assigned', ASSIGNMENTS, APPLICATIONS);
    await seed('completed', COMPLETIONS, APPLICATIONS + ASSIGNMENTS);
    await client.query('VACUUM ANALYZE contract_events');
  }, 120_000);

  afterAll(async () => {
    if (!client) return;
    await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    client.release();
    await pool.end();

    console.table(results.map(({ query, cost, timeMs, scans }) => ({ query, cost, timeMs, scans: scans.join(', ') })));
    const out = process.env.BENCH_RESULTS_FILE;
    if (out) {
      mkdirSync(dirname(out), { recursive: true });
      const line = { commit: commitSha(), recordedAt: new Date().toISOString(), maxCost: MAX_COST, maxTimeMs: MAX_TIME_MS, results };
      appendFileSync(out, JSON.stringify(line) + '\n');
    }
  });

  it.each(CASES)('$name stays within cost/time budget without a sequential scan', async ({ name, options }) => {
    const { text, values } = buildLeaderboardQuery(options);

    // Warm the cache once so the measured run reflects steady state.
    await client.query(text, values);
    const { rows } = await client.query(`EXPLAIN (ANALYZE, COSTS, BUFFERS, FORMAT JSON) ${text}`, values);
    const [explain] = rows[0]['QUERY PLAN'] as [{ Plan: PlanNode & { 'Actual Total Time': number }; 'Execution Time': number }];

    const cost = explain.Plan['Total Cost'];
    const timeMs = explain['Execution Time'];
    const all = nodes(explain.Plan);
    const scans = all.filter((n) => /Scan/.test(n['Node Type'])).map((n) => `${n['Node Type']}(${n['Relation Name'] ?? '-'})`);
    results.push({ query: name, cost, timeMs, scans });

    const seqScans = all.filter((n) => n['Node Type'] === 'Seq Scan' && n['Relation Name'] === 'contract_events');
    expect(seqScans).toEqual([]);
    expect(cost).toBeLessThan(MAX_COST);
    expect(timeMs).toBeLessThan(MAX_TIME_MS);
  });
});
