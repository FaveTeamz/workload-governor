import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import Redis from "ioredis";
import logger from "../logger.js";

const WINDOW_MS = 60_000;
const MAX_MEMORY_BUCKETS = 10_000;
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const REDIS_TIMEOUT_MS = 1_000;

interface RateLimitRule {
  name: "public" | "contributor-write" | "webhook";
  limit: number;
}

interface BucketState {
  tokens: number;
  updatedAt: number;
  lastSeenAt: number;
}

interface LimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

const TOKEN_BUCKET_SCRIPT = `
local time = redis.call("TIME")
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local capacity = tonumber(ARGV[1])
local refill_per_ms = tonumber(ARGV[2])
local window_ms = tonumber(ARGV[3])
local tokens = tonumber(redis.call("HGET", KEYS[1], "tokens")) or capacity
local updated_at = tonumber(redis.call("HGET", KEYS[1], "updated_at")) or now

tokens = math.min(capacity, tokens + math.max(0, now - updated_at) * refill_per_ms)
local allowed = 0
local retry_after = 0

if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
else
  retry_after = math.max(1, math.ceil((1 - tokens) / refill_per_ms / 1000))
end

redis.call("HSET", KEYS[1], "tokens", tokens, "updated_at", now)
redis.call("PEXPIRE", KEYS[1], window_ms)

local reset_at = math.ceil((now + (capacity - tokens) / refill_per_ms) / 1000)
return { allowed, math.floor(tokens), reset_at, retry_after }
`;

const memoryBuckets = new Map<string, BucketState>();
let redisClient: Redis | undefined;
let redisUnavailable = false;
let lastRedisWarningAt = 0;
let lastMemoryPruneAt = 0;

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(REDIS_URL, {
      lazyConnect: true,
      connectTimeout: REDIS_TIMEOUT_MS,
      commandTimeout: REDIS_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (attempt) => Math.min(attempt * 100, 2_000),
    });
    redisClient.on("error", reportRedisUnavailable);
  }
  return redisClient;
}

function reportRedisUnavailable(error: Error): void {
  const now = Date.now();
  redisUnavailable = true;
  if (now - lastRedisWarningAt >= 30_000) {
    logger.warn({ error }, "Redis rate limiter unavailable; using process-local limits");
    lastRedisWarningAt = now;
  }
}

function selectRule(req: Request): RateLimitRule {
  const path = req.path.toLowerCase();

  if (/(?:^|\/)webhooks?(?:\/|$)/.test(path)) {
    return { name: "webhook", limit: 300 };
  }
  if (/(?:^|\/)(?:apply|withdraw)(?:\/|$)/.test(path)) {
    return { name: "contributor-write", limit: 30 };
  }
  return { name: "public", limit: 120 };
}

function getIdentifier(req: Request, rule: RateLimitRule): string {
  if (rule.name === "contributor-write") {
    const body = req.body as
      | { contributor?: unknown; address?: unknown; stellarAddress?: unknown; stellar_address?: unknown }
      | undefined;
    const address =
      body?.contributor ??
      body?.address ??
      body?.stellarAddress ??
      body?.stellar_address ??
      req.get("x-stellar-address");
    if (typeof address === "string" && address.trim()) {
      return address.trim();
    }
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

function keyFor(rule: RateLimitRule, identifier: string): string {
  const digest = createHash("sha256").update(identifier).digest("hex");
  return `workload-governor:rate-limit:v1:${rule.name}:${digest}`;
}

function setHeaders(res: Response, rule: RateLimitRule, result: LimitResult): void {
  res.setHeader("X-RateLimit-Limit", String(rule.limit));
  res.setHeader("X-RateLimit-Remaining", String(result.remaining));
  res.setHeader("X-RateLimit-Reset", String(result.resetAt));
}

function setDefaultHeaders(req: Request, res: Response): void {
  const rule = selectRule(req);
  setHeaders(res, rule, {
    allowed: true,
    remaining: rule.limit,
    resetAt: Math.ceil((Date.now() + WINDOW_MS) / 1000),
    retryAfterSeconds: 0,
  });
}

function pruneMemoryBuckets(now: number): void {
  if (now - lastMemoryPruneAt < WINDOW_MS) {
    return;
  }
  lastMemoryPruneAt = now;
  for (const [key, bucket] of memoryBuckets) {
    if (now - bucket.lastSeenAt >= WINDOW_MS) {
      memoryBuckets.delete(key);
    }
  }
}

function consumeMemoryBucket(key: string, limit: number): LimitResult {
  const now = Date.now();
  pruneMemoryBuckets(now);

  const refillPerMs = limit / WINDOW_MS;
  const bucket = memoryBuckets.get(key);
  const tokens = bucket
    ? Math.min(limit, bucket.tokens + Math.max(0, now - bucket.updatedAt) * refillPerMs)
    : limit;
  const allowed = tokens >= 1;
  const remainingTokens = allowed ? tokens - 1 : tokens;

  if (!bucket && memoryBuckets.size >= MAX_MEMORY_BUCKETS) {
    const oldestKey = memoryBuckets.keys().next().value;
    if (oldestKey !== undefined) {
      memoryBuckets.delete(oldestKey);
    }
  }

  memoryBuckets.set(key, {
    tokens: remainingTokens,
    updatedAt: now,
    lastSeenAt: now,
  });

  return {
    allowed,
    remaining: Math.floor(remainingTokens),
    resetAt: Math.ceil((now + (limit - remainingTokens) / refillPerMs) / 1000),
    retryAfterSeconds: allowed
      ? 0
      : Math.max(1, Math.ceil((1 - remainingTokens) / refillPerMs / 1000)),
  };
}

async function consumeRedisBucket(key: string, limit: number): Promise<LimitResult> {
  const result: unknown = await getRedisClient().eval(
    TOKEN_BUCKET_SCRIPT,
    1,
    key,
    limit,
    limit / WINDOW_MS,
    WINDOW_MS,
  );
  if (
    !Array.isArray(result) ||
    result.length !== 4 ||
    !result.every((value) => Number.isFinite(Number(value)))
  ) {
    throw new Error("Redis rate limiter returned an invalid token bucket result");
  }

  const [allowed, remaining, resetAt, retryAfterSeconds] = result.map(Number);
  if (redisUnavailable) {
    logger.info("Redis rate limiter recovered");
    redisUnavailable = false;
  }
  return {
    allowed: allowed === 1,
    remaining,
    resetAt,
    retryAfterSeconds,
  };
}

export function rateLimitHeadersMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  setDefaultHeaders(req, res);
  next();
}

export async function rateLimiterMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const rule = selectRule(req);
  const key = keyFor(rule, getIdentifier(req, rule));
  let result: LimitResult;

  try {
    result = await consumeRedisBucket(key, rule.limit);
  } catch (error) {
    reportRedisUnavailable(error instanceof Error ? error : new Error(String(error)));
    result = consumeMemoryBucket(key, rule.limit);
  }

  setHeaders(res, rule, result);
  if (!result.allowed) {
    res.setHeader("Retry-After", String(result.retryAfterSeconds));
    res.status(429).json({
      error: "Too many requests",
      retryAfterSeconds: result.retryAfterSeconds,
    });
    return;
  }
  next();
}
