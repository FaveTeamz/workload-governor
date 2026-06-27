import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

// GET /api/events?org_id=&limit=&offset=&event_type=&start_date=&end_date=
router.get('/', async (req: Request, res: Response) => {
  const { org_id, event_type, start_date, end_date, limit = 50, offset = 0 } = req.query;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (org_id) {
    params.push(org_id);
    conditions.push(`org_id = $${params.length}`);
  }

  if (event_type) {
    params.push(event_type);
    conditions.push(`event_type = $${params.length}`);
  }

  if (start_date) {
    params.push(new Date(start_date as string));
    conditions.push(`timestamp >= $${params.length}`);
  }

  if (end_date) {
    params.push(new Date(end_date as string));
    conditions.push(`timestamp <= $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitNum = Math.min(Math.max(parseInt(limit as string) || 50, 1), 1000);
  const offsetNum = Math.max(parseInt(offset as string) || 0, 0);

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM contract_events ${where}`,
      params,
    );

    const total = parseInt((countResult.rows[0] as Record<string, unknown>).total as string, 10);

    const result = await pool.query(
      `SELECT * FROM contract_events ${where} ORDER BY timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offsetNum],
    );

    res.json({
      events: result.rows,
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < total,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: msg });
  }
});

export default router;
