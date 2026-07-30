import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { getCached, setCached } from '../cache';
import { validateQuery } from '../middleware/validation';
import { issueQuerySchema } from '../schemas/issues';

const router = Router();

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

router.get(
  '/',
  validateQuery(issueQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const { org_id, status, search, page = '1', limit = '10' } = req.query as IssuesListParams;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 10));

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
    const total = parseInt((countResult.rows[0]?.count as string) || '0', 10);

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

    res.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: msg });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/issues/:org_id/:issue_id
// Returns full issue detail: DB metadata, applicant count, assigned
// contributor (if any), and the event timeline for this issue.
// ---------------------------------------------------------------------------

export interface IssueDetailRow {
  id: number;
  org_id: string;
  title: string;
  /** Markdown body synced from GitHub. May be null for legacy rows. */
  body: string | null;
  /** Comma-separated label names. May be null. */
  labels: string | null;
  /** URL of the issue on GitHub. */
  github_url: string | null;
  status: string;
  created_at: string;
}

export interface IssueDetailEvent {
  id: number;
  event_type: string;
  contributor: string | null;
  actor: string;
  timestamp: string;
  tx_hash: string | null;
}

export interface IssueDetailResponse {
  issue: IssueDetailRow;
  applicant_count: number;
  /** Contributor address if the issue is currently assigned, otherwise null. */
  assigned_to: string | null;
  events: IssueDetailEvent[];
}

const CACHE_TTL_SECONDS = 30;

router.get('/:org_id/:issue_id', async (req: Request, res: Response) => {
  const { org_id, issue_id } = req.params;

  // Basic validation
  const issueIdNum = parseInt(issue_id, 10);
  if (!org_id || isNaN(issueIdNum) || issueIdNum < 1) {
    return res.status(400).json({ error: 'Invalid org_id or issue_id' });
  }

  const cacheKey = `issue_detail:${org_id}:${issue_id}`;
  const cached = getCached<IssueDetailResponse>(cacheKey);
  if (cached) return res.json(cached);

  try {
    // 1. Fetch the issue row
    const issueResult = await pool.query<IssueDetailRow>(
      `SELECT id, org_id, title, body, labels, github_url, status, created_at
       FROM issues
       WHERE org_id = $1 AND id = $2
       LIMIT 1`,
      [org_id, issueIdNum],
    );

    if (issueResult.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    const issue = issueResult.rows[0];

    // 2. Applicant count (pending applications only)
    const appCountResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM applications
       WHERE org_id = $1 AND issue_id = $2`,
      [org_id, issueIdNum],
    );
    const applicant_count = parseInt(appCountResult.rows[0]?.count ?? '0', 10);

    // 3. Current assignment (if any)
    const assignResult = await pool.query<{ contributor: string }>(
      `SELECT contributor
       FROM assignments
       WHERE org_id = $1 AND issue_id = $2
       LIMIT 1`,
      [org_id, issueIdNum],
    );
    const assigned_to = assignResult.rows[0]?.contributor ?? null;

    // 4. Timeline events for this issue, ordered oldest → newest
    const eventsResult = await pool.query<IssueDetailEvent>(
      `SELECT id, event_type, contributor, actor, timestamp,
              data->>'tx_hash' AS tx_hash
       FROM contract_events
       WHERE org_id = $1 AND issue_id = $2
       ORDER BY timestamp ASC`,
      [org_id, issueIdNum],
    );

    const response: IssueDetailResponse = {
      issue,
      applicant_count,
      assigned_to,
      events: eventsResult.rows,
    };

    setCached(cacheKey, response, CACHE_TTL_SECONDS);
    return res.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal server error';
    return res.status(500).json({ error: msg });
  }
});

export default router;
