/**
 * Replay protection middleware for signed auth payloads.
 *
 * Checks two independent conditions before allowing a request through:
 *
 *  1. Ledger expiry — the network's current ledger must be less than the
 *     payload's max_ledger field. Stale payloads are rejected with 400.
 *
 *  2. Nonce uniqueness — the nonce is atomically stored in Redis with a TTL
 *     that covers the remaining validity window. If the nonce is already
 *     present, the payload has been seen before and is rejected with 409.
 *
 * Usage:
 *   import { replayProtection } from '../middleware/replayProtection';
 *   router.post('/protected', replayProtection(), handler);
 *
 * For tests, inject a mock Redis client and ledger fetcher:
 *   replayProtection({ redisClient: mockClient, getLedger: async () => 1000 })
 */

import { Request, Response, NextFunction } from 'express';
import { validateSignedPayloadBase } from '../schemas/auth';

// ---------------------------------------------------------------------------
// Redis client abstraction
// ---------------------------------------------------------------------------

/**
 * Minimal Redis interface this module requires.
 * Satisfied by ioredis.Redis and easy to mock in tests.
 */
export interface RedisClient {
  set(
    key: string,
    value: string,
    exMode: 'EX',
    ttlSeconds: number,
    setMode: 'NX',
  ): Promise<'OK' | null>;
}

/** Module-level singleton, created lazily from REDIS_URL. */
let _defaultClient: RedisClient | null = null;

/**
 * Returns (and lazily creates) the default Redis client.
 * The import is dynamic so that tests can run without ioredis installed —
 * tests always inject their own client via options.
 */
async function getDefaultClient(): Promise<RedisClient> {
  if (_defaultClient) return _defaultClient;

  // Dynamic import avoids a hard startup failure when ioredis is absent in
  // test environments that inject their own client.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error — ioredis is a production runtime dependency; not declared in devDependencies
  const { Redis } = await import('ioredis') as { Redis: new (url: string) => RedisClient };
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const client: RedisClient = new Redis(url);
  _defaultClient = client;
  return client;
}

/** Replace the default client — used in tests and for custom connection setup. */
export function setRedisClient(client: RedisClient): void {
  _defaultClient = client;
}

// ---------------------------------------------------------------------------
// Ledger fetcher abstraction
// ---------------------------------------------------------------------------

export type LedgerFetcher = () => Promise<number>;

/** Module-level override, used in tests. */
let _defaultLedgerFetcher: LedgerFetcher | null = null;

/** Override the ledger fetcher — used in tests. */
export function setLedgerFetcher(fn: LedgerFetcher): void {
  _defaultLedgerFetcher = fn;
}

/**
 * Fetch the current Stellar ledger sequence from the configured Horizon endpoint.
 * Falls back to the testnet public endpoint when STELLAR_HORIZON_URL is not set.
 */
async function fetchCurrentLedger(): Promise<number> {
  const horizon =
    process.env.STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';

  const res = await fetch(`${horizon}/ledgers?order=desc&limit=1`);
  if (!res.ok) {
    throw new Error(`Horizon returned ${res.status} when fetching latest ledger`);
  }
  const json = (await res.json()) as {
    _embedded: { records: Array<{ sequence: number }> };
  };
  const sequence = json._embedded?.records?.[0]?.sequence;
  if (typeof sequence !== 'number') {
    throw new Error('Unexpected Horizon ledger response shape');
  }
  return sequence;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export interface ReplayProtectionOptions {
  /** Inject a Redis client (required in tests, optional in production). */
  redisClient?: RedisClient;
  /** Inject a ledger fetcher (required in tests, optional in production). */
  getLedger?: LedgerFetcher;
  /**
   * TTL strategy for nonce keys in Redis.
   * Default: 10 minutes (covers the ~8-minute window for 100 ledgers + buffer).
   */
  nonceTtlSeconds?: number;
}

/**
 * Returns an Express middleware that enforces replay protection.
 * Call once per protected route. Options are evaluated at middleware-creation
 * time for static overrides, or at request time for dynamic ones.
 */
export function replayProtection(options: ReplayProtectionOptions = {}) {
  const { nonceTtlSeconds = 600 } = options;

  return async function replayProtectionMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    // --- 1. Structural validation of replay-protection fields ---
    const body = req.body as Record<string, unknown>;
    const fieldErrors = validateSignedPayloadBase(body);
    if (fieldErrors.length > 0) {
      res.status(400).json({ error: 'Invalid signed payload', details: fieldErrors });
      return;
    }

    const { nonce, max_ledger } = body as {
      nonce: string;
      ledger_sequence: number;
      max_ledger: number;
    };

    // --- 2. Ledger expiry check ---
    let currentLedger: number;
    try {
      const getLedger = options.getLedger ?? _defaultLedgerFetcher ?? fetchCurrentLedger;
      currentLedger = await getLedger();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'failed to fetch current ledger';
      res.status(503).json({ error: `Ledger check unavailable: ${msg}` });
      return;
    }

    if (currentLedger >= max_ledger) {
      res.status(400).json({
        error: 'Signed payload has expired',
        detail: `Current ledger ${currentLedger} has reached or passed max_ledger ${max_ledger}`,
      });
      return;
    }

    // --- 3. Nonce uniqueness check (atomic SET NX) ---
    let redis: RedisClient;
    try {
      redis = options.redisClient ?? (await getDefaultClient());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Redis connection failed';
      res.status(503).json({ error: `Replay protection unavailable: ${msg}` });
      return;
    }

    const redisKey = `nonce:${nonce}`;
    let setResult: 'OK' | null;
    try {
      setResult = await redis.set(redisKey, '1', 'EX', nonceTtlSeconds, 'NX');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Redis error';
      res.status(503).json({ error: `Replay protection unavailable: ${msg}` });
      return;
    }

    if (setResult === null) {
      res.status(409).json({
        error: 'Transaction payload already consumed',
        detail: 'This signed payload has already been submitted and cannot be reused',
      });
      return;
    }

    // All checks passed — continue to the route handler.
    next();
  };
}
