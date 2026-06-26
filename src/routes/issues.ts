import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { getCache, setCache, invalidateCache } from '../services/redis';
import { validateRequest } from '../middleware/validation';
import {
  createIssueSchema,
  updateIssueSchema,
  issueParamsSchema,
  issueQuerySchema,
} from '../schemas/issues';

const router = Router();

// GET /api/issues?org_id=&status=
router.get(
  '/',
  validateRequest({ query: issueQuerySchema }),
  async (req: Request, res: Response) => {
    const { org_id, status } = req.query as { org_id?: string; status?: string };
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (org_id) {
      params.push(org_id);
      conditions.push(`org_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const cacheKey = `issues:${org_id || 'all'}:${status || 'all'}`;

    try {
      const cached = await getCache(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const { rows } = await pool.query(
        `SELECT * FROM issues ${where} ORDER BY id`,
        params
      );
      await setCache(cacheKey, rows, 30);
      res.json(rows);
    } catch {
      res.status(500).json({ error: 'internal server error' });
    }
  }
);

// GET /api/issues/:id
router.get(
  '/:id',
  validateRequest({ params: issueParamsSchema }),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const cacheKey = `issue:${id}`;

    try {
      const cached = await getCache(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const { rows } = await pool.query('SELECT * FROM issues WHERE id = $1', [
        id,
      ]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'issue not found' });
      }

      await setCache(cacheKey, rows[0], 30);
      res.json(rows[0]);
    } catch {
      res.status(500).json({ error: 'internal server error' });
    }
  }
);

// POST /api/issues
router.post(
  '/',
  validateRequest({ body: createIssueSchema }),
  async (req: Request, res: Response) => {
    const { org_id, title, status } = req.body as {
      org_id: string;
      title: string;
      status?: string;
    };

    try {
      const { rows } = await pool.query(
        'INSERT INTO issues (org_id, title, status) VALUES ($1, $2, $3) RETURNING *',
        [org_id, title, status || 'open']
      );

      await invalidateCache('issues:*');
      res.status(201).json(rows[0]);
    } catch {
      res.status(500).json({ error: 'internal server error' });
    }
  }
);

// PUT /api/issues/:id
router.put(
  '/:id',
  validateRequest({ params: issueParamsSchema, body: updateIssueSchema }),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { title, status } = req.body as {
      title?: string;
      status?: string;
    };

    try {
      const { rows } = await pool.query(
        'UPDATE issues SET title = COALESCE($1, title), status = COALESCE($2, status) WHERE id = $3 RETURNING *',
        [title || null, status || null, id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'issue not found' });
      }

      await invalidateCache('issues:*');
      await invalidateCache(`issue:${id}`);
      res.json(rows[0]);
    } catch {
      res.status(500).json({ error: 'internal server error' });
    }
  }
);

export default router;
