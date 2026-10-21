import Redis from 'ioredis';
import { logger } from '../logger';

// ---------------------------------------------------------------------------
// Exponential backoff with jitter — issue #1016
//
// Reconnect delay formula:
//   base = min(2^attempt * BASE_DELAY_MS, MAX_DELAY_MS)
//   jitter = base * JITTER_FACTOR * Math.random()
//   delay = base + jitter
//
// Reconnection is abandoned after MAX_RETRY_ATTEMPTS to prevent infinite loops
// (ioredis will emit an 'error' event and stop retrying when null is returned).
// ---------------------------------------------------------------------------
const BASE_DELAY_MS     = 100;
const MAX_DELAY_MS      = 30_000; // 30 s
const JITTER_FACTOR     = 0.25;   // ±25 % random jitter
const MAX_RETRY_ATTEMPTS = 20;

function exponentialBackoffStrategy(attempt: number): number | null {
  if (attempt > MAX_RETRY_ATTEMPTS) {
    logger.error({
      message: 'Redis max reconnect attempts reached, giving up',
      attempt,
      max: MAX_RETRY_ATTEMPTS,
    });
    // Returning null tells ioredis to stop retrying
    return null;
  }

  const base   = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
  const jitter = base * JITTER_FACTOR * Math.random();
  const delay  = Math.ceil(base + jitter);

  logger.warn({
    message: 'Redis reconnect attempt',
    attempt,
    delay_ms: delay,
    next_retry_in_ms: delay,
  });

  return delay;
}

const redis = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  // Use exponential backoff with jitter instead of linear back-off
  retryStrategy: exponentialBackoffStrategy,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  // Prevent unhandled promise rejections from failed commands during reconnect
  lazyConnect: false,
});

// ---------------------------------------------------------------------------
// Structured lifecycle event logging (issue #1016)
// ---------------------------------------------------------------------------

redis.on('connect', () => {
  logger.info({ message: 'Redis connection established' });
});

redis.on('ready', () => {
  logger.info({ message: 'Redis client ready' });
});

redis.on('reconnecting', (delay: number) => {
  logger.warn({ message: 'Redis reconnecting', delay_ms: delay });
});

redis.on('error', (err: Error) => {
  logger.error({
    message: 'Redis connection error',
    error: err.message,
    stack: err.stack,
  });
});

redis.on('close', () => {
  logger.warn({ message: 'Redis connection closed' });
});

redis.on('end', () => {
  logger.warn({ message: 'Redis connection ended — no further reconnects' });
});

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

export interface CacheMetrics {
  hits: number;
  misses: number;
}

const metrics: CacheMetrics = { hits: 0, misses: 0 };

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const cached = await redis.get(key);
    if (cached) {
      metrics.hits++;
      logger.debug({ message: 'Cache HIT', key, total_hits: metrics.hits });
      return JSON.parse(cached) as T;
    }
    metrics.misses++;
    logger.debug({ message: 'Cache MISS', key, total_misses: metrics.misses });
    return null;
  } catch (error) {
    logger.error({
      message: 'Cache get error',
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function setCache<T>(key: string, value: T, ttl: number = 30): Promise<void> {
  try {
    await redis.setex(key, ttl, JSON.stringify(value));
    logger.debug({ message: 'Cache SET', key, ttl_s: ttl });
  } catch (error) {
    logger.error({
      message: 'Cache set error',
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info({ message: 'Cache invalidated', pattern, keys_deleted: keys.length });
    }
  } catch (error) {
    logger.error({
      message: 'Cache invalidation error',
      pattern,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function getMetrics(): CacheMetrics {
  return { hits: metrics.hits, misses: metrics.misses };
}

export async function closeRedis(): Promise<void> {
  await redis.quit();
}

export default redis;
