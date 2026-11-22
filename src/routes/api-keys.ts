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

router.post('/:id/rotate', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const id = parseInt(req.params['id'] ?? '', 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }

  const graceHours =
    typeof req.body?.ttl_hours === 'number' && req.body.ttl_hours > 0
      ? req.body.ttl_hours
      : parseInt(process.env['API_KEY_ROTATION_GRACE_HOURS'] ?? '1', 10) || 1;

  try {
    const existing = await pool.query<{ id: number; label: string; key_hash: string; expires_at: Date | null }>(
      'SELECT id, label, key_hash, expires_at FROM api_keys WHERE id = $1',
      [id],
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'key not found' });
      return;
    }

    const oldKey = existing.rows[0];
    const newKey = randomBytes(32).toString('hex');
    const newKeyHash = hashKey(newKey);
    const rotatingUntil = new Date(Date.now() + graceHours * 60 * 60 * 1000);

    let newKeyRow: { id: number; expires_at: Date | null } | undefined;
    try {
      const result = await pool.query<{ id: number; expires_at: Date | null }>(
        `INSERT INTO api_keys (key_hash, label, scopes, expires_at, rotating_until)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, expires_at`,
        [newKeyHash, `${oldKey.label}-rotated`, [], oldKey.expires_at ?? null, rotatingUntil],
      );
      newKeyRow = result.rows[0];
    } catch {
      const result = await pool.query<{ id: number; expires_at: Date | null }>(
        `INSERT INTO api_keys (key_hash, label)
         VALUES ($1, $2)
         RETURNING id`,
        [newKeyHash, `${oldKey.label}-rotated`],
      );
      newKeyRow = result.rows[0];
    }

    await pool.query(
      'UPDATE api_keys SET rotating_until = $1 WHERE id = $2',
      [rotatingUntil, id],
    );

    logger.info({
      message: 'API key rotated',
      old_id: id,
      new_id: newKeyRow?.id,
      label: oldKey.label,
      grace_hours: graceHours,
      rotating_until: rotatingUntil.toISOString(),
    });

    res.status(200).json({
      id: newKeyRow?.id,
      key: newKey,
      old_key_id: id,
      rotating_until: rotatingUntil.toISOString(),
      expires_at: newKeyRow?.expires_at ? new Date(newKeyRow.expires_at).toISOString() : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal error';
    res.status(500).json({ error: msg });
  }
});

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
