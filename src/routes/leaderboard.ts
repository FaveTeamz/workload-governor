import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

export interface LeaderboardQueryOptions {
  timeframe?: unknown;
  limit?: unknown;
  org_id?: unknown;
}

/**
 * Builds the leaderboard aggregation (contributors ranked by completed
 * assignments). Exported so the EXPLAIN ANALYZE benchmark in
 * tests/perf/leaderboardQuery.test.ts measures exactly the SQL the endpoint runs.
 *
 * Only `completed` events are counted. The filter is always part of the WHERE
 * clause, so the query is valid with or without an org/timeframe filter, and
 * it can use the partial index `idx_contract_events_completed_contributor`.
 */
export function buildLeaderboardQuery({ timeframe = 'all', limit, org_id }: LeaderboardQueryOptions): {
  text: string;
  values: unknown[];
  limit: number;
} {
  const limitNum = Math.min(Math.max(parseInt((limit as string) ?? '20', 10) || 20, 1), 100);

  const conditions: string[] = [`event_type = 'completed'`];
  const values: unknown[] = [];

  if (org_id) {
    values.push(org_id);
    conditions.push(`org_id = $${values.length}`);
  }

  if (timeframe === 'week') {
    conditions.push(`timestamp >= NOW() - INTERVAL '7 days'`);
  } else if (timeframe === 'month') {
    conditions.push(`timestamp >= NOW() - INTERVAL '30 days'`);
  }

  values.push(limitNum);
  const text = `SELECT
       contributor,
       org_id,
       COUNT(*) AS completed_count
     FROM contract_events
     WHERE ${conditions.join(' AND ')}
     GROUP BY contributor, org_id
     ORDER BY completed_count DESC
     LIMIT $${values.length}`;

  return { text, values, limit: limitNum };
}

/**
 * GET /api/v1/leaderboard
 *
 * Returns contributors ranked by completed assignments.
 * Query params:
 *   timeframe  – "week" | "month" | "all" (default "all")
 *   limit      – max results (1-100, default 20)
 *   org_id     – optional filter by org
 */
router.get('/', async (req: Request, res: Response) => {
  const { timeframe = 'all', limit, org_id } = req.query;
  const query = buildLeaderboardQuery({ timeframe, limit, org_id });

  try {
    const result = await pool.query(query.text, query.values);

    res.json({
      leaderboard: result.rows,
      timeframe,
      limit: query.limit,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: msg });
  }
});

export default router;
