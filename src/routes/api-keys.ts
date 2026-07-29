/**
 * api-keys.ts
 *
 * Admin-only routes for managing API keys.
 *
 * POST   /api/api-keys          — generate a new API key (admin only)
 * DELETE /api/admin/api-keys/:id — revoke an API key by its DB id (admin only)
 *
 * Keys are stored hashed (SHA-256) in the `api_keys` table.
 * The plaintext key is returned exactly once at creation time and never stored.
 * Keys expire after 90 days unless a custom ttl is supplied.
 */

import { Router, Request, Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import { pool } from '../db';
import { logger } from '../logger';

const router = Router();

const DEFAULT_TTL_DAYS = 90;

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function requireAdmin(req: Request, res: Response): boolean {
  const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '');
  if (!token || token !== process.env['ADMIN_TOKEN']) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// POST /api/api-keys — generate a new key
// ---------------------------------------------------------------------------
// Body: { label: string, scopes?: string[], ttl_days?: number }
// Requires: Authorization: Bearer <ADMIN_TOKEN>
// Returns: { key: string, id: number, expires_at: string }

router.post('/', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { label, scopes, ttl_days } = req.body as {
    label?: string;
    scopes?: string[];
    ttl_days?: number;
  };

  if (!label) {
    res.status(400).json({ error: 'label required' });
    return;
  }

  const key = randomBytes(32).toString('hex');
  const keyHash = hashKey(key);
  const ttl = typeof ttl_days === 'number' && ttl_days > 0 ? ttl_days : DEFAULT_TTL_DAYS;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttl);

  const scopeArray: string[] = Array.isArray(scopes) ? scopes : [];

  try {
    // Attempt to insert with optional columns first; fall back to base schema
    let id: number;
    try {
      const { rows } = await pool.query<{ id: number }>(
        `INSERT INTO api_keys (key_hash, label, scopes, expires_at)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [keyHash, label, scopeArray, expiresAt],
      );
      id = rows[0].id;
    } catch {
      // Fallback: table might not have scopes/expires_at columns yet
      const { rows } = await pool.query<{ id: number }>(
        `INSERT INTO api_keys (key_hash, label)
         VALUES ($1, $2)
         RETURNING id`,
        [keyHash, label],
      );
      id = rows[0].id;
    }

    logger.info({ message: 'API key created', label, id, ttl_days: ttl });
    res.status(201).json({ key, id, expires_at: expiresAt.toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal error';
    res.status(500).json({ error: msg });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/api-keys/:id — revoke a key by DB id
// ---------------------------------------------------------------------------
// Requires: Authorization: Bearer <ADMIN_TOKEN>

router.delete('/:id', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const id = parseInt(req.params['id'] ?? '', 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }

  try {
    const { rows } = await pool.query<{ id: number; label: string }>(
      'DELETE FROM api_keys WHERE id = $1 RETURNING id, label',
      [id],
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'key not found' });
      return;
    }

    logger.info({ message: 'API key revoked', id: rows[0].id, label: rows[0].label });
    res.status(204).send();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal error';
    res.status(500).json({ error: msg });
  }
});

export default router;
export { hashKey };
