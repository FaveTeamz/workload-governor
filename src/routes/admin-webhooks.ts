import { Router, Request, Response } from 'express';
import { pool } from '../db';
import redis from '../services/redis';
import { DLQ_KEY, dispatchToWebhook, WebhookPayload } from '../services/webhook-dispatcher';

const router = Router();

interface DeadLetterRow {
  id: number;
  webhook_id: number;
  payload: WebhookPayload;
  last_error: string;
  attempts: number;
  last_status_code: number | null;
  last_response_body: string | null;
  created_at: string;
  url: string;
  secret: string;
}

function requireAdmin(req: Request, res: Response): boolean {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token || !process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

router.get('/dlq', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    const result = await pool.query<DeadLetterRow>(
      `SELECT id, webhook_id, payload, last_error, attempts, last_status_code,
              last_response_body, created_at, url
       FROM webhook_dead_letters
       ORDER BY created_at DESC
       LIMIT $1`,
      [100],
    );

    if (result.rows.length > 0) {
      return res.json({ queue: DLQ_KEY, entries: result.rows, total: result.rows.length });
    }
  } catch {
    // Redis remains available as a fallback when the database is unavailable.
  }

  try {
    const entries = await redis.lrange(DLQ_KEY, 0, 99);
    return res.json({
      queue: DLQ_KEY,
      entries: entries.flatMap((entry) => {
        try {
          return [JSON.parse(entry) as Omit<DeadLetterRow, 'id' | 'created_at' | 'secret'>];
        } catch {
          return [];
        }
      }),
      total: entries.length,
    });
  } catch {
    return res.status(500).json({ error: 'failed to inspect dead-letter queue' });
  }
});

router.post('/dlq/:id/replay', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: 'invalid dead-letter id' });
  }

  try {
    const result = await pool.query<DeadLetterRow>(
      `SELECT id, webhook_id, payload, url, secret
       FROM webhook_dead_letters
       WHERE id = $1
       LIMIT 1`,
      [id],
    );
    const deadLetter = result.rows[0];
    if (!deadLetter) {
      return res.status(404).json({ error: 'dead-letter delivery not found' });
    }

    const payload = typeof deadLetter.payload === 'string'
      ? JSON.parse(deadLetter.payload) as WebhookPayload
      : deadLetter.payload;
    if (!deadLetter.url || !deadLetter.secret) {
      return res.status(409).json({ error: 'dead-letter delivery cannot be replayed' });
    }

    const delivered = await dispatchToWebhook(
      deadLetter.webhook_id,
      deadLetter.url,
      deadLetter.secret,
      payload,
    );
    if (!delivered) {
      return res.status(502).json({ error: 'webhook replay failed; delivery remains in the dead-letter queue' });
    }

    await pool.query('DELETE FROM webhook_dead_letters WHERE id = $1', [id]);
    return res.json({ id, replayed: true });
  } catch {
    return res.status(500).json({ error: 'failed to replay dead-letter delivery' });
  }
});

export default router;