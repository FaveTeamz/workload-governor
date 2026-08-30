import { getCache, setCache, invalidateCache, getMetrics, closeRedis } from './services/redis';

export async function getCached<T>(key: string): Promise<T | null> {
  return getCache<T>(key);
}

export async function setCached<T>(key: string, value: T, ttl = 30): Promise<void> {
  await setCache<T>(key, value, ttl);
}

export { invalidateCache, getMetrics, closeRedis };
