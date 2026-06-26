import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { getCached, setCached } from '../cache';

const router = Router();
const CACHE_TTL = 30;

interface IssuesListParams {
  org_id?: string;
  status?: string;
  search?: string;
  page?: string;
  limit?: string;
}

interface IssueRow {
  id: number;
  org_id: string;
  title: string;
  status: string;
  created_at: string;
}

interface IssuesResponse {
  issues: IssueRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const { org_id, status, search, page = '1', limit = '10' } = req.query as IssuesListParams;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

    const cacheKey = `issues:${org_id}:${status}:${search}:${pageNum}:${limitNum}`;
    const cached = await getCached<IssuesResponse>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

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
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`title ILIKE $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM issues ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    const offset = (pageNum - 1) * limitNum;
    params.push(limitNum);
    params.push(offset);

    const { rows } = await pool.query<IssueRow>(
      `SELECT * FROM issues ${where} ORDER BY id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const response: IssuesResponse = {
      issues: rows,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };

    await setCached(cacheKey, response, CACHE_TTL);
    res.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: msg });
  }
});

export default router;
