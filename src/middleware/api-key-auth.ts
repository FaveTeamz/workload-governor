/**
 * api-key-auth.ts
 *
 * API key authentication middleware.
 *
 * Behaviour:
 *   - No Authorization header → IP-based rate limit (30 req/min), pass through
 *   - Bearer token present, valid key in DB → attach req.apiKey context, apply
 *     per-key rate limit (120 req/min), pass through
 *   - Bearer token present, NOT in DB (or expired) → 401 { error: 'invalid api key' }
 *   - Bearer token present, key is expired (expires_at < now) → 401 { error: 'invalid api key',
 *     code: 'key_expired' }
 *   - Rate limit exceeded → 429 { error: 'rate limit exceeded', retryAfter }
 *
 * Key storage:
 *   Keys are stored hashed (SHA-256) in the api_keys table.  The plaintext key
 *   is never persisted.  The table may include optional columns:
 *     - scopes   TEXT[]    — array of granted scopes
 *     - expires_at TIMESTAMPTZ — null means no expiry (or 90-day default)
 */

import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { pool } from '../db';
import redis from '../services/redis';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum requests per minute for requests authenticated with a valid API key. */
export const KEY_LIMIT = 120;

/** Maximum requests per minute for unauthenticated (IP-based) requests. */
export const IP_LIMIT = 30;

/** Sliding window duration in seconds. */
const WINDOW_SEC = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiKeyContext {
  id: number;
  label: string;
  scopes: string[];
  keyHash: string;
}

// Extend Express Request to carry the resolved key context
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: ApiKeyContext;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function getIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  const raw =
    (typeof fwd === 'string' ? fwd.split(',')[0].trim() : req.socket?.remoteAddress) ?? 'unknown';
  // Normalize IPv4-mapped IPv6 addresses (::ffff:1.2.3.4 → 1.2.3.4)
  return raw.replace(/^::ffff:/, '');
}

// ---------------------------------------------------------------------------
// DB lookup
// ---------------------------------------------------------------------------

interface ApiKeyRow {
  id: number;
  label: string;
  scopes: string[] | null;
  expires_at: Date | null;
}

async function lookupApiKey(raw: string): Promise<ApiKeyRow | null> {
  const h = hashKey(raw);
  const { rows } = await pool.query<ApiKeyRow>(
    `SELECT id, label, scopes, expires_at
     FROM api_keys
     WHERE key_hash = $1`,
    [h],
  );
  return rows.length > 0 ? rows[0] : null;
}

// ---------------------------------------------------------------------------
// Redis sliding-window rate limiter
// ---------------------------------------------------------------------------

/**
 * Wrap a Redis command with a timeout. If the command does not complete within
 * `ms` milliseconds, the returned promise resolves to `null` so the caller
 * can fail-open rather than hanging indefinitely.
 */
function withTimeout<T>(promise: Promise<T>, ms = 300): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * Increment the Redis counter for `identifier` in the current window.
 * If the counter exceeds `limit`, write 429 + Retry-After and return false.
 * Otherwise return true (request is allowed).
 * Returns true (fail-open) if Redis is unavailable.
 */
async function checkRedisLimit(
  identifier: string,
  limit: number,
  res: Response,
): Promise<boolean> {
  const key = `rl:${identifier}`;
  const count = await withTimeout(redis.incr(key));
  if (count === null) {
    // Redis unavailable — fail open
    return true;
  }
  if (count === 1) {
    // First hit in this window — set the expiry (fire and forget)
    withTimeout(redis.expire(key, WINDOW_SEC)).catch(() => undefined);
  }

  if (count > limit) {
    const ttlRaw = await withTimeout(redis.ttl(key));
    const ttl = typeof ttlRaw === 'number' ? ttlRaw : WINDOW_SEC;
    const retryAfter = ttl > 0 ? ttl : WINDOW_SEC;
    res.set('Retry-After', String(retryAfter));
    res.set('X-RateLimit-Limit', String(limit));
    res.set('X-RateLimit-Remaining', '0');
    res.status(429).json({ error: 'rate limit exceeded', retryAfter });
    return false;
  }

  // Set informational headers
  res.set('X-RateLimit-Limit', String(limit));
  res.set('X-RateLimit-Remaining', String(Math.max(0, limit - count)));
  return true;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers['authorization'];

  // Strip "Bearer " prefix (case-insensitive). If no prefix, treat the whole
  // value as the raw token (matches malformed-header test expectations).
  const raw = authHeader?.replace(/^Bearer\s+/i, '') ?? null;

  if (raw !== null) {
    // Admin token bypass — admin routes handle their own auth check
    if (raw === process.env['ADMIN_TOKEN']) {
      // Attach minimal context and pass through
      next();
      return;
    }

    // A token was provided — validate it against the DB
    try {
      const row = await lookupApiKey(raw);

      if (!row) {
        // Unknown key hash → 401
        res.status(401).json({ error: 'invalid api key' });
        return;
      }

      // Check expiry (if the table has expires_at column)
      if (row.expires_at !== null && new Date(row.expires_at) < new Date()) {
        res.status(401).json({ error: 'invalid api key', code: 'key_expired' });
        return;
      }

      // Attach context to the request for downstream use
      req.apiKey = {
        id: row.id,
        label: row.label,
        scopes: Array.isArray(row.scopes) ? row.scopes : [],
        keyHash: hashKey(raw),
      };

      // Apply per-key rate limit
      const allowed = await checkRedisLimit(`key:${hashKey(raw)}`, KEY_LIMIT, res);
      if (!allowed) return;

      next();
      return;
    } catch {
      // DB/Redis unavailable — reject to be safe
      res.status(401).json({ error: 'invalid api key' });
      return;
    }
  }

  // No token — apply IP-based rate limit and pass through
  const ip = getIp(req);
  try {
    const allowed = await checkRedisLimit(`ip:${ip}`, IP_LIMIT, res);
    if (!allowed) return;
  } catch {
    // If Redis is down, fail-open for unauthenticated requests
  }
  next();
}
