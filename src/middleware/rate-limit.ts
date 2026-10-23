import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { ApiKeyTier, TIER_LIMITS } from './api-key-auth';

const getClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
};

const getWalletAddress = (req: Request): string | null => {
  const wallet = req.query.wallet || req.body?.wallet;
  return wallet ? String(wallet) : null;
};

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => getClientIp(req),
  handler: (req: Request, res: Response) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rateLimitInfo = (req as any).rateLimit;
    const retryAfter =
      rateLimitInfo?.resetTime && typeof rateLimitInfo.resetTime === 'number'
        ? Math.ceil((rateLimitInfo.resetTime - Date.now()) / 1000)
        : 60;
    res.set('Retry-After', String(retryAfter));
    res.status(429).json({
      error: 'too many requests',
      retryAfter,
    });
  },
});

const walletLimitStore: Map<
  string,
  { count: number; resetTime: number }
> = new Map();

export function walletLimiter(req: Request, res: Response, next: () => void) {
  const wallet = getWalletAddress(req);

  if (!wallet) {
    return next();
  }

  const now = Date.now();
  const limit = 10;
  const windowMs = 60 * 1000;

  let entry = walletLimitStore.get(wallet);

  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + windowMs };
    walletLimitStore.set(wallet, entry);
  }

  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: 'wallet rate limit exceeded',
      retryAfter,
    });
  }

  entry.count++;
  next();
}

export function cleanupExpiredLimits() {
  const now = Date.now();
  for (const [wallet, entry] of walletLimitStore.entries()) {
    if (now > entry.resetTime) {
      walletLimitStore.delete(wallet);
    }
  }
}

setInterval(cleanupExpiredLimits, 60 * 1000);

// ---------------------------------------------------------------------------
// Tiered rate limiter (issue #840)
// ---------------------------------------------------------------------------

/**
 * In-memory store for tiered rate limit tracking.
 * Keyed by a discriminator built from (tier + IP or API-key hash).
 */
const tieredStore: Map<string, { count: number; resetTime: number }> = new Map();
const TIER_WINDOW_MS = 60 * 1000; // 1 minute

export function cleanupTieredLimits(): void {
  const now = Date.now();
  for (const [key, entry] of tieredStore.entries()) {
    if (now > entry.resetTime) tieredStore.delete(key);
  }
}

setInterval(cleanupTieredLimits, 60 * 1000);

/**
 * tieredRateLimiter
 *
 * Applied after apiKeyAuth has run so `req.apiKeyTier` is already set.
 * Enforces the following per-minute limits:
 *   anonymous   →   60 req/min
 *   contributor →  180 req/min
 *   maintainer  →  600 req/min
 *   admin       → 1200 req/min
 *
 * Injects X-RateLimit-Limit, X-RateLimit-Remaining, and X-RateLimit-Reset
 * headers on every response.  Returns 429 + Retry-After when quota exceeded.
 */
export function tieredRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const tier: ApiKeyTier = req.apiKeyTier ?? 'anonymous';
  const limit = TIER_LIMITS[tier];
  const ip = getClientIp(req);
  const key = `tier:${tier}:${ip}`;

  const now = Date.now();
  let entry = tieredStore.get(key);

  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + TIER_WINDOW_MS };
    tieredStore.set(key, entry);
  }

  entry.count++;

  const remaining = Math.max(limit - entry.count, 0);
  const resetEpochSec = Math.ceil(entry.resetTime / 1000);

  res.set('X-RateLimit-Limit', String(limit));
  res.set('X-RateLimit-Remaining', String(remaining));
  res.set('X-RateLimit-Reset', String(resetEpochSec));

  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    res.status(429).json({
      error: 'rate limit exceeded',
      tier,
      retryAfter,
    });
    return;
  }

  next();
}
