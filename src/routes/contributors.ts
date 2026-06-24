import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

// GET /api/contributors/:address/applications
router.get('/:address/applications', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, i.title, i.status FROM applications a
       JOIN issues i ON i.id = a.issue_id
       WHERE a.contributor = $1 ORDER BY a.created_at`,
      [req.params.address],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal server error' });
  }
});

// GET /api/contributors/:address/assignments
router.get('/:address/assignments', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, i.title, i.status FROM assignments a
       JOIN issues i ON i.id = a.issue_id
       WHERE a.contributor = $1 ORDER BY a.created_at`,
      [req.params.address],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal server error' });
  }
});

export default router;
