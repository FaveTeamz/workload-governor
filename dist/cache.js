"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initRedis = initRedis;
exports.getRedisClient = getRedisClient;
exports.closeRedis = closeRedis;
exports.getCached = getCached;
exports.setCached = setCached;
exports.deleteCached = deleteCached;
const redis_1 = require("redis");
let redisClient = null;
async function initRedis() {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    redisClient = (0, redis_1.createClient)({ url: redisUrl });
    redisClient.on('error', (err) => {
        console.error('Redis client error:', err);
    });
    await redisClient.connect();
    console.log('✓ Redis connected');
}
function getRedisClient() {
    if (!redisClient) {
        throw new Error('Redis client not initialized. Call initRedis() first.');
    }
    return redisClient;
}
async function closeRedis() {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        console.log('✓ Redis disconnected');
    }
}
async function getCached(key) {
    try {
        const client = getRedisClient();
        const cached = await client.get(key);
        return cached ? JSON.parse(cached) : null;
    }
    catch {
        return null;
    }
}
async function setCached(key, value, ttlSeconds) {
    try {
        const client = getRedisClient();
        await client.setEx(key, ttlSeconds, JSON.stringify(value));
    }
    catch (err) {
        console.error(`Failed to cache ${key}:`, err);
    }
}
async function deleteCached(key) {
    try {
        const client = getRedisClient();
        await client.del(key);
    }
    catch (err) {
        console.error(`Failed to delete cache ${key}:`, err);
    }
}
