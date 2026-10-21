import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { pool } from '../db';
import redis from '../services/redis';

export type ApiKeyTier = 'anonymous' | 'contributor' | 'maintainer' | 'admin';

/** Limits (requests per minute) per tier – consumed by rate-limit.ts */
export const TIER_LIMITS: Record<ApiKeyTier, number> = {
  anonymous: 60,
  contributor: 180,
  maintainer: 600,
  admin: 1200,
};

// Legacy per-key / per-IP limits kept for backward compat with existing tests
const KEY_LIMIT = 120;   // requests per minute for authenticated keys (fallback)
const IP_LIMIT = 30;     // requests per minute for unauthenticated IPs
const WINDOW_SEC = 60;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** API key tier, set by apiKeyAuth middleware */
      apiKeyTier?: ApiKeyTier;
    }
  }
}

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function getIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' ? fwd.split(',')[0] : req.socket.remoteAddress) ?? 'unknown';
}

/**
 * Lookup an API key in the database.
 * Returns the tier associated with the key, or null if not found.
 */
async function getApiKeyTier(raw: string): Promise<ApiKeyTier | null> {
  const h = hashKey(raw);
  const { rows } = await pool.query<{ tier: ApiKeyTier }>(
    `SELECT COALESCE(tier, 'contributor') AS tier FROM api_keys WHERE key_hash = $1`,
    [h],
  );
  if (rows.length === 0) return null;
  const tier = rows[0].tier as ApiKeyTier;
  return TIER_LIMITS[tier] !== undefined ? tier : 'contributor';
}

async function checkRedisLimit(
  identifier: string,
  limit: number,
  res: Response,
): Promise<boolean> {
  const key = `rl:${identifier}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, WINDOW_SEC);
  if (count > limit) {
    const ttl = await redis.ttl(key);
    res.set('Retry-After', String(ttl > 0 ? ttl : WINDOW_SEC));
    res.status(429).json({ error: 'rate limit exceeded', retryAfter: ttl > 0 ? ttl : WINDOW_SEC });
    return false;
  }
  return true;
}

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const raw = req.headers.authorization?.replace(/^Bearer\s+/i, '');

  if (raw) {
    // Try to validate as API key first
    try {
      const tier = await getApiKeyTier(raw);
      if (tier !== null) {
        // Attach tier so tiered rate limiter can read it
        req.apiKeyTier = tier;

        const limit = TIER_LIMITS[tier];
        const allowed = await checkRedisLimit(`key:${hashKey(raw)}`, limit, res);
        if (allowed) return next();
        return;
      }
    } catch {
      // Fall through to IP-based limit if Redis/DB is unavailable
    }
    // Bearer token present but not a valid API key → reject
    res.status(401).json({ error: 'invalid api key' });
    return;
  }

  // No key — anonymous, apply IP-based fallback rate limit
  req.apiKeyTier = 'anonymous';
  const ip = getIp(req);
  try {
    const allowed = await checkRedisLimit(`ip:${ip}`, TIER_LIMITS.anonymous, res);
    if (!allowed) return;
  } catch {
    // If Redis is down, allow through (fail-open)
  }
  next();
}
