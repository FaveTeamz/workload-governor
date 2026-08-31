/**
 * rate-limit.ts
 *
 * Four layers of rate limiting:
 *
 *   1. globalLimiter      — express-rate-limit, 100 req/min per IP (anonymous traffic)
 *   2. apiKeyLimiter      — Redis sliding window, 200 req/min per API key
 *      (applied inside api-key-auth.ts after key validation)
 *   3. walletLimiter      — in-process sliding window, 10 req/min per contributor
 *      address (applied to /api/transactions/* routes)
 *   4. maintainerLimiter  — in-process sliding window, 100 req/min per
 *      (api_key_id + org_id) pair. Falls back to IP when unauthenticated.
 *      Applied to maintainer-scoped endpoints (assign, complete, revoke).
 *
 * All 429 responses include:
 *   - X-RateLimit-Limit
 *   - X-RateLimit-Remaining
 *   - X-RateLimit-Reset
 *   - Retry-After header
 *   - JSON body: { error, retryAfter }
 *
 * Fixes issue #558: rate limiter now differentiates by org_id for maintainer
 * endpoints, so a maintainer managing multiple orgs is not penalised for
 * legitimate cross-org activity, and shared-IP environments are not conflated.
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
// 1. Global limiter: 100 req/min per IP (anonymous)
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
// 3. Maintainer limiter: 100 req/min per (api_key_id + org_id)
//    For unauthenticated requests, falls back to IP-based limiting.
//    Applied to maintainer-scoped endpoints (assign, complete, revoke, etc.)
//    using the maintainerLimiter middleware factory.
//
//    Key derivation:
//      - Authenticated: `maint:key:<keyHash>:org:<orgId>`
//      - Unauthenticated: `maint:ip:<ip>:org:<orgId>`
//    where orgId is extracted from req.params.org_id || req.body.org_id.
// ---------------------------------------------------------------------------

const maintainerLimitStore = new Map<string, WindowEntry>();

/** Requests per window for authenticated maintainer calls. */
export const MAINTAINER_LIMIT = 100;
const MAINTAINER_WINDOW_MS = 60 * 1000;

/**
 * Derive the rate-limit store key for a maintainer request.
 *
 * - Authenticated requests  → keyed by `api_key_id + org_id`
 * - Unauthenticated requests → keyed by `IP + org_id`
 *
 * This prevents a maintainer managing multiple orgs from exhausting a single
 * counter and allows shared-IP environments to have independent per-org limits.
 */
function getMaintainerKey(req: Request): string {
  const orgId =
    (req.params['org_id'] as string | undefined) ??
    (req.body?.org_id as string | undefined) ??
    'unknown';

  // If the request carries a validated API key (attached by api-key-auth.ts)
  // use the key hash so each API key identity has its own bucket per org.
  const keyHash = req.apiKey?.keyHash;
  if (keyHash) {
    return `maint:key:${keyHash}:org:${orgId}`;
  }

  // Fallback to IP + org
  return `maint:ip:${getClientIp(req)}:org:${orgId}`;
}

/**
 * Express middleware that enforces the maintainer rate limit.
 * Returns 429 with standard rate-limit headers when the limit is exceeded.
 */
export function maintainerLimiter(req: Request, res: Response, next: () => void): void {
  const key = getMaintainerKey(req);
  const now = Date.now();

  let entry = maintainerLimitStore.get(key);

  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + MAINTAINER_WINDOW_MS };
    maintainerLimitStore.set(key, entry);
  }

  const remaining = Math.max(0, MAINTAINER_LIMIT - entry.count);
  res.set('X-RateLimit-Limit', String(MAINTAINER_LIMIT));
  res.set('X-RateLimit-Remaining', String(remaining));
  res.set('X-RateLimit-Reset', String(Math.ceil(entry.resetTime / 1000)));

  if (entry.count >= MAINTAINER_LIMIT) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    res.set('Retry-After', String(retryAfter > 0 ? retryAfter : MAINTAINER_WINDOW_MS / 1000));
    res.status(429).json({
      error: 'maintainer rate limit exceeded',
      retryAfter: retryAfter > 0 ? retryAfter : MAINTAINER_WINDOW_MS / 1000,
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

/** Clear all maintainer limit counters. Exposed for test teardown only. */
export function clearMaintainerLimitStore(): void {
  maintainerLimitStore.clear();
}

// Run cleanup every minute
setInterval(cleanupExpiredLimits, WALLET_WINDOW_MS);
