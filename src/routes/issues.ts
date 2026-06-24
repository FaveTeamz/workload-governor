import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

// GET /api/issues?org_id=&status=
router.get('/', async (req: Request, res: Response) => {
  const { org_id, status } = req.query;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (org_id) { params.push(org_id); conditions.push(`org_id = $${params.length}`); }
  if (status)  { params.push(status);  conditions.push(`status = $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(`SELECT * FROM issues ${where} ORDER BY id`, params);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal server error' });
  }
});

export default router;
