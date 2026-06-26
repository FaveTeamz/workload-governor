import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { getMetrics } from '../services/redis';

const router = Router();

function authMiddleware(req: Request, res: Response, next: () => void): void {
  const token = req.headers['x-admin-token'];
  if (token !== process.env.ADMIN_TOKEN) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

// GET /api/admin/metrics
router.get('/metrics', authMiddleware, (req: Request, res: Response) => {
  const metrics = getMetrics();
  res.json({
    cache: metrics,
  });
});

// POST /api/admin/maintainers  body: { address, org_id }
router.post('/maintainers', authMiddleware, async (req: Request, res: Response) => {
  const { address, org_id } = req.body as { address?: string; org_id?: string };
  if (!address || !org_id) {
    res.status(400).json({ error: 'address and org_id required' });
    return;
  }
  try {
    await pool.query(
      `INSERT INTO maintainers (address, org_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [address, org_id],
    );
    res.status(201).json({ address, org_id });
  } catch {
    res.status(500).json({ error: 'internal server error' });
  }
});

export default router;
