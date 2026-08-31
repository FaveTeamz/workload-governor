import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { getCache, setCache } from '../services/redis';

const router = Router();

/** Supported time-window periods */
const PERIOD_INTERVALS: Record<string, string | null> = {
  '7d':  '7 days',
  '30d': '30 days',
  '90d': '90 days',
  'all': null,
};

/** Allowed sort columns — mapped to SQL identifiers */
const SORT_COLUMNS: Record<string, string> = {
  fairness_score:     'fairness_score',
  completions:        'completions',
  applications:       'applications',
};

/** Redis TTL for leaderboard cache: 5 minutes */
const CACHE_TTL_SECONDS = 300;

export interface LeaderboardEntry {
  rank: number;
  contributor: string;
  contributor_short: string;
  applications: number;
  completions: number;
  active_assignments: number;
  fairness_score: number;
}

export interface LeaderboardResponse {
  data: LeaderboardEntry[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  period: string;
  org_id: string | null;
  sort_by: string;
}

/**
 * GET /api/leaderboard
 *
 * Query parameters:
 *   org_id    string  (optional) — filter to a single organisation
 *   period    string  (default '30d') — 7d | 30d | 90d | all
 *   sort_by   string  (default 'fairness_score') — fairness_score | completions | applications
 *   page      number  (default 1)
 *   limit     number  (default 20, max 100)
 *
 * Fairness score = completions / (applications + 1)
 * Cached in Redis for 5 minutes per unique query key.
 */
router.get('/', async (req: Request, res: Response) => {
  const org_id  = typeof req.query.org_id  === 'string' ? req.query.org_id  : null;
  const period  = typeof req.query.period  === 'string' ? req.query.period  : '30d';
  const sort_by = typeof req.query.sort_by === 'string' ? req.query.sort_by : 'fairness_score';
  const page    = Math.max(1, parseInt(String(req.query.page  ?? '1'),  10) || 1);
  const limit   = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
  const offset  = (page - 1) * limit;

  if (!(period in PERIOD_INTERVALS)) {
    res.status(400).json({ error: 'invalid period, accepted values: 7d, 30d, 90d, all' });
    return;
  }
  if (!(sort_by in SORT_COLUMNS)) {
    res.status(400).json({ error: 'invalid sort_by, accepted values: fairness_score, completions, applications' });
    return;
  }

  const cacheKey = `leaderboard:${org_id ?? 'all'}:${period}:${sort_by}:${page}:${limit}`;
  const cached = await getCache<LeaderboardResponse>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const interval = PERIOD_INTERVALS[period];
    const sortCol  = SORT_COLUMNS[sort_by];

    // Build the time-window clause. When interval is null (period=all) we skip the filter.
    const sinceClause = interval
      ? `AND (a.created_at >= NOW() - INTERVAL '${interval}' OR asgn.created_at >= NOW() - INTERVAL '${interval}')`
      : '';

    const params: unknown[] = [org_id, limit, offset];

    const sql = `
      WITH stats AS (
        SELECT
          COALESCE(a.contributor, asgn.contributor)                           AS contributor,
          COUNT(DISTINCT a.issue_id)::int                                     AS applications,
          COUNT(DISTINCT CASE WHEN i.status = 'completed' THEN asgn.issue_id END)::int AS completions,
          COUNT(DISTINCT CASE WHEN i.status = 'assigned'  THEN asgn.issue_id END)::int AS active_assignments
        FROM       applications a
        FULL OUTER JOIN assignments asgn
               ON  a.contributor = asgn.contributor
        LEFT  JOIN issues i ON asgn.issue_id = i.id
        WHERE ($1::text IS NULL OR a.org_id = $1 OR asgn.org_id = $1)
          ${sinceClause}
        GROUP BY COALESCE(a.contributor, asgn.contributor)
      ),
      ranked AS (
        SELECT
          contributor,
          applications,
          completions,
          active_assignments,
          ROUND((completions::numeric / (applications + 1)), 4) AS fairness_score,
          COUNT(*) OVER ()                                       AS total_count
        FROM stats
        WHERE contributor IS NOT NULL
      )
      SELECT
        ROW_NUMBER() OVER (ORDER BY ${sortCol} DESC NULLS LAST) AS rank,
        contributor,
        applications,
        completions,
        active_assignments,
        fairness_score,
        total_count
      FROM ranked
      ORDER BY ${sortCol} DESC NULLS LAST
      LIMIT $2 OFFSET $3
    `;

    const { rows } = await pool.query(sql, params);

    const total = rows.length > 0 ? parseInt(String(rows[0].total_count), 10) : 0;

    const data: LeaderboardEntry[] = rows.map((r) => ({
      rank:               parseInt(String(r.rank), 10),
      contributor:        String(r.contributor),
      contributor_short:  `${String(r.contributor).slice(0, 6)}…${String(r.contributor).slice(-4)}`,
      applications:       parseInt(String(r.applications), 10),
      completions:        parseInt(String(r.completions), 10),
      active_assignments: parseInt(String(r.active_assignments), 10),
      fairness_score:     parseFloat(String(r.fairness_score)),
    }));

    const response: LeaderboardResponse = {
      data,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
      period,
      org_id,
      sort_by,
    };

    await setCache(cacheKey, response, CACHE_TTL_SECONDS);

    res.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: msg });
  }
});

export default router;
