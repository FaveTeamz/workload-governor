import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  enableReadyCheck: true,
  enableOfflineQueue: true,
});

export interface CacheMetrics {
  hits: number;
  misses: number;
}

const metrics: CacheMetrics = {
  hits: 0,
  misses: 0,
};

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('Redis connected');
});

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const cached = await redis.get(key);
    if (cached) {
      metrics.hits++;
      console.log(`Cache HIT for key: ${key} (Total hits: ${metrics.hits})`);
      return JSON.parse(cached);
    }
    metrics.misses++;
    console.log(`Cache MISS for key: ${key} (Total misses: ${metrics.misses})`);
    return null;
  } catch (error) {
    console.error(`Cache get error for key ${key}:`, error);
    return null;
  }
}

export async function setCache<T>(
  key: string,
  value: T,
  ttl: number = 30
): Promise<void> {
  try {
    await redis.setex(key, ttl, JSON.stringify(value));
    console.log(`Cache SET for key: ${key} with TTL: ${ttl}s`);
  } catch (error) {
    console.error(`Cache set error for key ${key}:`, error);
  }
}

export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`Cache invalidated for pattern: ${pattern} (${keys.length} keys deleted)`);
    }
  } catch (error) {
    console.error(`Cache invalidation error for pattern ${pattern}:`, error);
  }
}

export function getMetrics(): CacheMetrics {
  return {
    hits: metrics.hits,
    misses: metrics.misses,
  };
}

export async function closeRedis(): Promise<void> {
  await redis.quit();
}

export default redis;
