import { Router, Request, Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import { pool } from '../db';
import { logger } from '../logger';

const router = Router();

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// POST /api-keys  — admin only (requires ADMIN_TOKEN env var)
router.post('/', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token || token !== process.env.ADMIN_TOKEN) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const { label } = req.body as { label?: string };
  if (!label) {
    res.status(400).json({ error: 'label required' });
    return;
  }

  const key = randomBytes(32).toString('hex');
  const keyHash = hashKey(key);

  try {
    await pool.query(
      'INSERT INTO api_keys (key_hash, label) VALUES ($1, $2)',
      [keyHash, label],
    );
    logger.info({ message: 'API key created', label });
    res.status(201).json({ key });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal error';
    res.status(500).json({ error: msg });
  }
});

export default router;
export { hashKey };
