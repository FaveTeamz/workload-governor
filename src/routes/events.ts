/**
 * GET /api/events
 *
 * Query params:
 *   org_id      – filter by organisation
 *   contributor – filter by contributor address
 *   page        – 1-based page number (default: 1)
 *   limit       – results per page (default: 20, max: 100)
 *   event_type  – filter by topic
 *   start_date  – ISO timestamp lower bound
 *   end_date    – ISO timestamp upper bound
 */
import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { subscribeToLiveEvents } from '../services/event-bus';

const router = Router();

router.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(': connected\n\n');

  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
  const unsubscribe = subscribeToLiveEvents((event) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
  });

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

// GET /api/events?org_id=&limit=&offset=&event_type=&start_date=&end_date=
router.get('/', async (req: Request, res: Response) => {
  const {
    org_id,
    contributor,
    event_type,
    start_date,
    end_date,
  } = req.query as Record<string, string | undefined>;

  const rawPage  = parseInt(String(req.query['page']  ?? '1'),  10);
  const rawLimit = parseInt(String(req.query['limit'] ?? '20'), 10);

  const page  = Math.max(rawPage,  1);
  const limit = Math.min(Math.max(rawLimit, 1), 100);
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];

  function push(val: unknown, clause: string) {
    params.push(val);
    conditions.push(clause.replace('?', `$${params.length}`));
  }

  if (org_id)      push(org_id,      'org_id = ?');
  if (contributor) push(contributor, 'contributor = ?');
  if (event_type)  push(event_type,  'topic = ?');
  if (start_date)  push(new Date(start_date), 'created_at >= ?');
  if (end_date)    push(new Date(end_date),   'created_at <= ?');

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const countRes = await pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM events ${where}`,
      params,
    );
    const total = parseInt(countRes.rows[0]?.total ?? '0', 10);

    const dataRes = await pool.query(
      `SELECT id, ledger, tx_hash, topic, org_id, issue_id, contributor, created_at
         FROM events
        ${where}
        ORDER BY ledger DESC, id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    res.json({
      events: dataRes.rows,
      pagination: {
        total,
        page,
        limit,
        offset,
        total_pages: Math.ceil(total / limit),
        has_more: offset + limit < total,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: msg });
  }
});

export default router;
