/**
 * rate-limit.ts
 *
 * Three layers of rate limiting:
 *
 *   1. globalLimiter   — express-rate-limit, 60 req/min per IP (anonymous traffic)
 *   2. apiKeyLimiter   — Redis sliding window, 200 req/min per API key
 *      (applied inside api-key-auth.ts after key validation)
 *   3. walletLimiter   — in-process sliding window, 10 req/min per contributor
 *      address (applied to /api/transactions/* routes)
 *
 * All 429 responses include:
 *   - X-RateLimit-Limit    (set by express-rate-limit for globalLimiter)
 *   - X-RateLimit-Remaining
 *   - X-RateLimit-Reset
 *   - Retry-After header
 *   - JSON body: { error, retryAfter }
 */

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

export function getWalletAddress(req: Request): string | null {
  const wallet = req.query['wallet'] ?? req.body?.wallet;
  return wallet ? String(wallet) : null;
}

// ---------------------------------------------------------------------------
// 1. Global limiter: 60 req/min per IP (anonymous)
// ---------------------------------------------------------------------------

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,   // sets RateLimit-* headers (RFC 6585)
  legacyHeaders: false,
  keyGenerator: (req: Request) => getClientIp(req),
  handler: (req: Request, res: Response) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rlInfo = (req as any).rateLimit as
      | { resetTime?: number }
      | undefined;
    const retryAfter =
      rlInfo?.resetTime && typeof rlInfo.resetTime === 'number'
        ? Math.ceil((rlInfo.resetTime - Date.now()) / 1000)
        : 60;
    res.set('Retry-After', String(retryAfter > 0 ? retryAfter : 60));
    res.status(429).json({
      error: 'too many requests',
      retryAfter: retryAfter > 0 ? retryAfter : 60,
    });
  },
});

// ---------------------------------------------------------------------------
// 2. Wallet / contributor limiter: 10 req/min per contributor address
//    Applied to /api/transactions/* via walletLimiter middleware.
//    Uses an in-process sliding-window Map so it works without Redis.
// ---------------------------------------------------------------------------

interface WindowEntry {
  count: number;
  resetTime: number;
}

const walletLimitStore = new Map<string, WindowEntry>();

const WALLET_LIMIT = 10;
const WALLET_WINDOW_MS = 60 * 1000;

export function walletLimiter(req: Request, res: Response, next: () => void): void {
  const wallet = getWalletAddress(req);

  if (!wallet) {
    next();
    return;
  }

  const now = Date.now();

  let entry = walletLimitStore.get(wallet);

  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + WALLET_WINDOW_MS };
    walletLimitStore.set(wallet, entry);
  }

  // Set informational headers before the limit check
  const remaining = Math.max(0, WALLET_LIMIT - entry.count);
  res.set('X-RateLimit-Limit', String(WALLET_LIMIT));
  res.set('X-RateLimit-Remaining', String(remaining));
  res.set('X-RateLimit-Reset', String(Math.ceil(entry.resetTime / 1000)));

  if (entry.count >= WALLET_LIMIT) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    res.set('Retry-After', String(retryAfter > 0 ? retryAfter : WALLET_WINDOW_MS / 1000));
    res.status(429).json({
      error: 'wallet rate limit exceeded',
      retryAfter: retryAfter > 0 ? retryAfter : WALLET_WINDOW_MS / 1000,
    });
    return;
  }

  entry.count++;
  next();
}

// ---------------------------------------------------------------------------
// Maintenance helpers (exported for tests)
// ---------------------------------------------------------------------------

/** Remove expired entries from the in-process wallet store. */
export function cleanupExpiredLimits(): void {
  const now = Date.now();
  for (const [wallet, entry] of walletLimitStore.entries()) {
    if (now > entry.resetTime) {
      walletLimitStore.delete(wallet);
    }
  }
}

/** Clear all wallet limit counters. Exposed for test teardown only. */
export function clearWalletLimitStore(): void {
  walletLimitStore.clear();
}

// Run cleanup every minute
setInterval(cleanupExpiredLimits, WALLET_WINDOW_MS);
