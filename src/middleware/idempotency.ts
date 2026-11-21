/**
 * Idempotency middleware for POST /api/transactions
 *
 * Behaviour:
 *  - If no Idempotency-Key header is present → pass through (key is optional).
 *  - First request with a given key:
 *      1. Write a "pending" sentinel to Redis (key: idemp:{key}, TTL 300s).
 *      2. Let the request proceed; intercept the response and cache it.
 *  - Subsequent requests with the same key (sentinel still in Redis):
 *      - If the sentinel is still "pending" (first request hasn't finished) → 409 Conflict.
 *      - If a completed response is cached → replay the cached status + body.
 *
 * Redis key schema:
 *   idemp:{idempotencyKey}  →  JSON { status: "pending" | "done", code: number, body: unknown }
 */

import { Request, Response, NextFunction } from 'express';
import redis from '../services/redis';

const IDEMP_TTL_SEC = 300; // 5 minutes
const KEY_PREFIX = 'idemp:';

interface IdempotencyCacheEntry {
  status: 'pending' | 'done';
  code: number;
  body: unknown;
}

/**
 * Express middleware that enforces idempotency using the Idempotency-Key header.
 * Safe to attach to any POST route.
 */
export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const key = req.headers['idempotency-key'];

  // No header → behave as a normal request
  if (!key || typeof key !== 'string' || key.trim() === '') {
    return next();
  }

  const redisKey = `${KEY_PREFIX}${key.trim()}`;

  // --- Check existing entry ---
  let existing: IdempotencyCacheEntry | null = null;
  try {
    const raw = await redis.get(redisKey);
    if (raw) {
      existing = JSON.parse(raw) as IdempotencyCacheEntry;
    }
  } catch {
    // Redis unavailable — fail-open so the request proceeds
    return next();
  }

  if (existing) {
    if (existing.status === 'pending') {
      // A concurrent request with the same key is still in-flight
      res.status(409).json({
        error: 'conflict',
        message:
          'A request with this Idempotency-Key is already being processed. ' +
          'Please wait for it to complete before retrying.',
      });
      return;
    }

    // Completed previously — replay the cached response
    res.status(existing.code).json(existing.body);
    return;
  }

  // --- First time seeing this key: write pending sentinel ---
  try {
    await redis.setex(
      redisKey,
      IDEMP_TTL_SEC,
      JSON.stringify({ status: 'pending', code: 0, body: null } satisfies IdempotencyCacheEntry),
    );
  } catch {
    // Redis unavailable — fail-open
    return next();
  }

  // --- Intercept the outgoing response to cache it ---
  const originalJson = res.json.bind(res);

  res.json = function (body: unknown): Response {
    // Persist the completed response for future replays
    const entry: IdempotencyCacheEntry = {
      status: 'done',
      code: res.statusCode,
      body,
    };
    redis
      .setex(redisKey, IDEMP_TTL_SEC, JSON.stringify(entry))
      .catch(() => {
        // Best-effort: if caching fails the response still goes out
      });

    return originalJson(body);
  };

  next();
}
