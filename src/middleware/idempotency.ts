/**
 * idempotency.ts
 *
 * Middleware that enforces idempotent request processing via Redis-backed
 * in-flight lock keys.
 *
 * Flow:
 *   1. Extract the `Idempotency-Key` header from the request.
 *   2. Return 400 if the header is missing on a mutating request.
 *   3. If a completed result is cached, replay it immediately (200/201 response
 *      with the original status code and body).
 *   4. If an in-flight lock key already exists, return 409 so the client knows
 *      a duplicate request is still being processed.
 *   5. Set the in-flight lock key before delegating to the route handler.
 *   6. Wrap `next()` in a try…finally so the lock is **always** deleted on
 *      unhandled exceptions — preventing stale locks from blocking retries
 *      until TTL expiration (fixes #1013).
 *   7. On success, persist the response body under the result key and delete
 *      the in-flight lock.
 *
 * Redis key schema:
 *   idem:lock:<key>    — in-flight sentinel, TTL = LOCK_TTL_SECONDS
 *   idem:result:<key>  — completed response payload, TTL = RESULT_TTL_SECONDS
 *
 * Configuration (environment variables):
 *   IDEMPOTENCY_LOCK_TTL_SECONDS   — default 30
 *   IDEMPOTENCY_RESULT_TTL_SECONDS — default 86400 (24 h)
 */

import { Request, Response, NextFunction } from 'express';
import redis from '../services/redis';
import { logger } from '../logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOCK_TTL_SECONDS = parseInt(
  process.env.IDEMPOTENCY_LOCK_TTL_SECONDS ?? '30',
  10,
);

const RESULT_TTL_SECONDS = parseInt(
  process.env.IDEMPOTENCY_RESULT_TTL_SECONDS ?? '86400',
  10,
);

/** HTTP methods that require idempotency-key enforcement. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

function lockKey(idempotencyKey: string): string {
  return `idem:lock:${idempotencyKey}`;
}

function resultKey(idempotencyKey: string): string {
  return `idem:result:${idempotencyKey}`;
}

// ---------------------------------------------------------------------------
// Stored result shape
// ---------------------------------------------------------------------------

interface StoredResult {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Express middleware that guarantees at-most-once processing for mutating
 * requests carrying an `Idempotency-Key` header.
 *
 * The in-flight lock is released in a `finally` block so that any unexpected
 * synchronous or asynchronous error thrown by a downstream handler cannot
 * leave a stale lock in Redis (fixes GitHub issue #1013).
 */
export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const method = req.method.toUpperCase();

  // Only enforce idempotency for mutating operations
  if (!MUTATING_METHODS.has(method)) {
    return next();
  }

  const idempotencyKeyHeader = req.headers['idempotency-key'];

  // Require the header on mutating requests
  if (!idempotencyKeyHeader) {
    res.status(400).json({
      error: 'missing_idempotency_key',
      message: 'Mutating requests must include an Idempotency-Key header.',
    });
    return;
  }

  const idempotencyKey = Array.isArray(idempotencyKeyHeader)
    ? idempotencyKeyHeader[0]
    : idempotencyKeyHeader;

  const lKey = lockKey(idempotencyKey);
  const rKey = resultKey(idempotencyKey);

  // ------------------------------------------------------------------
  // 1. Check for a completed result — replay it if present
  // ------------------------------------------------------------------
  try {
    const cached = await redis.get(rKey);
    if (cached) {
      const stored: StoredResult = JSON.parse(cached);
      logger.info({
        message: 'idempotency: replaying cached result',
        idempotencyKey,
        statusCode: stored.statusCode,
      });

      // Restore original response headers
      for (const [header, value] of Object.entries(stored.headers)) {
        res.setHeader(header, value);
      }
      res.set('X-Idempotency-Replayed', 'true');
      res.status(stored.statusCode).json(stored.body);
      return;
    }
  } catch (err) {
    // Redis read failure — allow the request through rather than hard-blocking
    logger.error({
      message: 'idempotency: failed to read result cache, proceeding',
      idempotencyKey,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ------------------------------------------------------------------
  // 2. Acquire the in-flight lock (NX = only set if not exists)
  // ------------------------------------------------------------------
  let lockAcquired = false;
  try {
    const setResult = await redis.set(lKey, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
    lockAcquired = setResult === 'OK';
  } catch (err) {
    // Redis write failure — allow the request through to avoid hard-blocking
    logger.error({
      message: 'idempotency: failed to acquire lock, proceeding without lock',
      idempotencyKey,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (!lockAcquired) {
    // Another request with the same key is already in-flight
    res.status(409).json({
      error: 'duplicate_request',
      message:
        'A request with this Idempotency-Key is already being processed. Retry after it completes.',
    });
    return;
  }

  // ------------------------------------------------------------------
  // 3. Intercept the response so we can persist a successful result
  // ------------------------------------------------------------------
  const chunks: Buffer[] = [];
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  let responseBody = '';

  // Capture streamed body chunks
  res.write = function (
    chunk: unknown,
    ...args: unknown[]
  ): boolean {
    if (chunk) {
      chunks.push(
        Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(typeof chunk === 'string' ? chunk : String(chunk)),
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (originalWrite as any)(chunk, ...args);
  } as typeof res.write;

  // ------------------------------------------------------------------
  // 4. Delegate to downstream handler — release lock in finally block
  //    so unhandled errors never leave a stale lock in Redis (#1013).
  // ------------------------------------------------------------------
  try {
    await new Promise<void>((resolve, reject) => {
      // Override res.end to capture body and signal completion
      res.end = function (
        chunk?: unknown,
        ...args: unknown[]
      ): Response {
        if (chunk) {
          chunks.push(
            Buffer.isBuffer(chunk)
              ? chunk
              : Buffer.from(typeof chunk === 'string' ? chunk : String(chunk)),
          );
        }

        responseBody = Buffer.concat(chunks).toString('utf8');

        // Persist successful results for replay
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const bodyJson = responseBody ? JSON.parse(responseBody) : null;

            // Collect response headers worth replaying (content-type etc.)
            const headersToStore: Record<string, string> = {};
            const contentType = res.getHeader('content-type');
            if (contentType) {
              headersToStore['content-type'] = String(contentType);
            }

            const stored: StoredResult = {
              statusCode: res.statusCode,
              body: bodyJson,
              headers: headersToStore,
            };

            redis
              .setex(rKey, RESULT_TTL_SECONDS, JSON.stringify(stored))
              .catch((err: Error) => {
                logger.error({
                  message: 'idempotency: failed to persist result',
                  idempotencyKey,
                  error: err.message,
                });
              });
          } catch {
            // Non-JSON body — store raw string
            const stored: StoredResult = {
              statusCode: res.statusCode,
              body: responseBody,
              headers: {},
            };
            redis
              .setex(rKey, RESULT_TTL_SECONDS, JSON.stringify(stored))
              .catch((err: Error) => {
                logger.error({
                  message: 'idempotency: failed to persist raw result',
                  idempotencyKey,
                  error: err.message,
                });
              });
          }
        }

        // Restore original end and flush
        res.end = originalEnd;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const returnValue = (originalEnd as any)(chunk, ...args);
        resolve();
        return returnValue;
      } as typeof res.end;

      next((err?: unknown) => {
        if (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
  } finally {
    // Always release the in-flight lock — even if the handler threw.
    // This is the core fix for #1013: without this block, an unhandled
    // exception would leave the lock key in Redis until TTL expiry,
    // preventing clients from safely retrying the request.
    redis.del(lKey).catch((err: Error) => {
      logger.error({
        message: 'idempotency: failed to delete lock key on cleanup',
        idempotencyKey,
        lockKey: lKey,
        error: err.message,
      });
    });
  }
}
