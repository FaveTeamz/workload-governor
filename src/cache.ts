import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;

export async function initRedis(): Promise<void> {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  redisClient = createClient({ url: redisUrl });

  redisClient.on('error', (err) => {
    console.error('Redis client error:', err);
  });

  await redisClient.connect();
  console.log('✓ Redis connected');
}

export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call initRedis() first.');
  }
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('✓ Redis disconnected');
  }
}

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const client = getRedisClient();
    const cached = await client.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

export async function setCached<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  try {
    const client = getRedisClient();
    await client.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    console.error(`Failed to cache ${key}:`, err);
  }
}

export async function deleteCached(key: string): Promise<void> {
  try {
    const client = getRedisClient();
    await client.del(key);
  } catch (err) {
    console.error(`Failed to delete cache ${key}:`, err);
  }
}
