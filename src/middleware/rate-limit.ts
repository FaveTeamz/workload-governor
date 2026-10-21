import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { ApiKeyTier, TIER_LIMITS } from './api-key-auth';
import redis from '../services/redis';

// Lazy logger — falls back to console when logger module isn't available
// (e.g. in lightweight test environments that don't mock pino).
let _log: { warn: (obj: object) => void; error: (obj: object) => void } | null = null;
function getLogger() {
  if (!_log) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      _log = require('../logger').logger as typeof _log;
    } catch {
      _log = {
        warn:  (obj: object) => console.warn(obj),
        error: (obj: object) => console.error(obj),
      };
    }
  }
  return _log!;
}

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

/** Clear the wallet limit store — used in tests. */
export function clearWalletLimitStore(): void {
  walletLimitStore.clear();
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

// ---------------------------------------------------------------------------
// Maintainer rate limiter (issue #558)
// ---------------------------------------------------------------------------

export const MAINTAINER_LIMIT = 100; // req/min
const MAINTAINER_WINDOW_MS = 60 * 1000;

const maintainerStore: Map<string, { count: number; resetTime: number }> = new Map();

export function clearMaintainerLimitStore(): void {
  maintainerStore.clear();
}

export function cleanupMaintainerLimits(): void {
  const now = Date.now();
  for (const [key, entry] of maintainerStore.entries()) {
    if (now > entry.resetTime) maintainerStore.delete(key);
  }
}

setInterval(cleanupMaintainerLimits, 60 * 1000);

/**
 * maintainerLimiter
 *
 * In-process rate limiter for maintainer actions, keyed by
 * (api_key_hash OR ip) + org_id. Limit: 100 req/min.
 *
 * Injects X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers.
 */
export function maintainerLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip    = getClientIp(req);
  const orgId = req.params['org_id'] ?? req.body?.org_id ?? 'unknown';
  const key   = `maint:${ip}:${orgId}`;
  const now   = Date.now();

  let entry = maintainerStore.get(key);

  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + MAINTAINER_WINDOW_MS };
    maintainerStore.set(key, entry);
  }

  entry.count++;

  const remaining    = Math.max(MAINTAINER_LIMIT - entry.count, 0);
  const resetEpochSec = Math.ceil(entry.resetTime / 1000);

  res.set('X-RateLimit-Limit',     String(MAINTAINER_LIMIT));
  res.set('X-RateLimit-Remaining', String(remaining));
  res.set('X-RateLimit-Reset',     String(resetEpochSec));

  if (entry.count > MAINTAINER_LIMIT) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    res.status(429).json({
      error: 'maintainer rate limit exceeded',
      retryAfter,
    });
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// Redis-backed distributed token bucket rate limiter (issue #1015)
// ---------------------------------------------------------------------------

/**
 * Lua script for atomic token bucket rate limiting in Redis.
 *
 * Algorithm:
 *   1. Fetch current token count and last refill timestamp.
 *   2. Compute tokens to add based on elapsed time and refill rate.
 *   3. Clamp tokens to the bucket capacity.
 *   4. If at least one token is available, decrement and allow the request.
 *   5. Otherwise, deny and return the TTL until next token is available.
 *
 * KEYS[1]  — Redis key for this bucket (e.g. "tb:ip:1.2.3.4")
 * ARGV[1]  — capacity         (max tokens in bucket)
 * ARGV[2]  — refillRate       (tokens added per second)
 * ARGV[3]  — now              (current Unix timestamp in milliseconds)
 * ARGV[4]  — ttlMs            (key TTL in milliseconds — keeps Redis clean)
 *
 * Returns: [allowed (0|1), remaining tokens (integer), retryAfterMs (integer)]
 */
const TOKEN_BUCKET_LUA = `
local key        = KEYS[1]
local capacity   = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local now        = tonumber(ARGV[3])
local ttlMs      = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens      = tonumber(data[1])
local last_refill = tonumber(data[2])

if tokens == nil then
  tokens      = capacity
  last_refill = now
end

-- Refill tokens based on elapsed time
local elapsed      = math.max(0, now - last_refill)
local tokensToAdd  = math.floor(elapsed * refillRate / 1000)
tokens             = math.min(capacity, tokens + tokensToAdd)
if tokensToAdd > 0 then
  last_refill = now
end

local allowed      = 0
local retryAfterMs = 0

if tokens >= 1 then
  tokens  = tokens - 1
  allowed = 1
else
  -- Milliseconds until 1 token refills
  retryAfterMs = math.ceil(1000 / refillRate)
end

redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
redis.call('PEXPIRE', key, ttlMs)

return { allowed, tokens, retryAfterMs }
`;

export interface TokenBucketOptions {
  /** Maximum tokens in the bucket (burst capacity). Default: 60 */
  capacity?: number;
  /** Tokens added per second (steady-state rate). Default: 1 */
  refillRate?: number;
  /** Key prefix used to namespace buckets in Redis. Default: "tb" */
  keyPrefix?: string;
  /** Custom key generator. Defaults to client IP. */
  keyGenerator?: (req: Request) => string;
}

/**
 * redisTokenBucketLimiter
 *
 * Distributed token bucket rate limiter backed by Redis.
 * Uses a Lua script to perform the token-bucket algorithm atomically,
 * so it is safe for use in multi-instance backend deployments.
 *
 * Falls back to the existing in-process tieredRateLimiter if Redis is
 * unreachable, ensuring availability during Redis outages.
 *
 * Usage:
 *   app.use(redisTokenBucketLimiter({ capacity: 100, refillRate: 2 }));
 */
export function redisTokenBucketLimiter(opts: TokenBucketOptions = {}) {
  const capacity   = opts.capacity   ?? 60;
  const refillRate = opts.refillRate ?? 1;
  const keyPrefix  = opts.keyPrefix  ?? 'tb';
  const keyGen     = opts.keyGenerator ?? getClientIp;

  // Key TTL: twice the time it takes to fully refill the bucket
  const ttlMs = Math.ceil((capacity / refillRate) * 2 * 1000);

  return async function tokenBucketMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const bucketKey = `${keyPrefix}:${keyGen(req)}`;
    const now       = Date.now();

    let allowed      = true;
    let remaining    = capacity;
    let retryAfterMs = 0;

    try {
      // Execute atomic Lua script
      const result = await (redis as unknown as {
        eval(script: string, numkeys: number, key: string, ...args: string[]): Promise<[number, number, number]>;
      }).eval(
        TOKEN_BUCKET_LUA,
        1,
        bucketKey,
        String(capacity),
        String(refillRate),
        String(now),
        String(ttlMs),
      );

      allowed      = result[0] === 1;
      remaining    = result[1];
      retryAfterMs = result[2];
    } catch (err) {
      // Redis unavailable — fail open and log the incident
      getLogger().warn({
        message: 'Redis token bucket unavailable, falling back to local limiter',
        key: bucketKey,
        error: err instanceof Error ? err.message : String(err),
      });
      // Delegate to in-process tiered limiter as fallback
      tieredRateLimiter(req, res, next);
      return;
    }

    const resetEpochSec = Math.ceil((now + (capacity / refillRate) * 1000) / 1000);

    res.set('X-RateLimit-Limit',     String(capacity));
    res.set('X-RateLimit-Remaining', String(remaining));
    res.set('X-RateLimit-Reset',     String(resetEpochSec));

    if (!allowed) {
      const retryAfterSec = Math.ceil(retryAfterMs / 1000) || 1;
      res.set('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: 'rate limit exceeded',
        retryAfter: retryAfterSec,
      });
      return;
    }

    next();
  };
}
