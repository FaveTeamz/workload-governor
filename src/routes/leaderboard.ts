import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

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

  const limitNum = Math.min(Math.max(parseInt((limit as string) ?? '20', 10) || 20, 1), 100);

  const conditions: string[] = [];
  const params: unknown[] = [];

  // Filter by org if provided
  if (org_id) {
    params.push(org_id);
    conditions.push(`org_id = $${params.length}`);
  }

  // Timeframe filter on timestamp
  if (timeframe === 'week') {
    conditions.push(`timestamp >= NOW() - INTERVAL '7 days'`);
  } else if (timeframe === 'month') {
    conditions.push(`timestamp >= NOW() - INTERVAL '30 days'`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await pool.query(
      `SELECT
         contributor,
         org_id,
         COUNT(*) AS completed_count
       FROM contract_events
       ${where}
       ${org_id ? '' : 'AND event_type = \'completed\''}
       GROUP BY contributor, org_id
       ORDER BY completed_count DESC
       LIMIT $${params.length + 1}`,
      [...params, limitNum],
    );

    res.json({
      leaderboard: result.rows,
      timeframe,
      limit: limitNum,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: msg });
  }
});

export default router;
