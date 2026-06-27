"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCache = getCache;
exports.setCache = setCache;
exports.invalidateCache = invalidateCache;
exports.getMetrics = getMetrics;
exports.closeRedis = closeRedis;
const ioredis_1 = __importDefault(require("ioredis"));
const redis = new ioredis_1.default({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    enableReadyCheck: true,
    enableOfflineQueue: true,
});
const metrics = {
    hits: 0,
    misses: 0,
};
redis.on('error', (err) => {
    console.error('Redis connection error:', err);
});
redis.on('connect', () => {
    console.log('Redis connected');
});
async function getCache(key) {
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
    }
    catch (error) {
        console.error(`Cache get error for key ${key}:`, error);
        return null;
    }
}
async function setCache(key, value, ttl = 30) {
    try {
        await redis.setex(key, ttl, JSON.stringify(value));
        console.log(`Cache SET for key: ${key} with TTL: ${ttl}s`);
    }
    catch (error) {
        console.error(`Cache set error for key ${key}:`, error);
    }
}
async function invalidateCache(pattern) {
    try {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
            await redis.del(...keys);
            console.log(`Cache invalidated for pattern: ${pattern} (${keys.length} keys deleted)`);
        }
    }
    catch (error) {
        console.error(`Cache invalidation error for pattern ${pattern}:`, error);
    }
}
function getMetrics() {
    return {
        hits: metrics.hits,
        misses: metrics.misses,
    };
}
async function closeRedis() {
    await redis.quit();
}
exports.default = redis;
