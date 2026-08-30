/**
 * Integration tests for rate limiting middleware — issue #379
 *
 * Tests cover:
 *  1. Requests from same IP exceeding IP_LIMIT (30 req/min) return 429
 *  2. Requests from same API key exceeding KEY_LIMIT (120 req/min) return 429
 *  3. 11th transaction from same contributor wallet (walletLimiter limit=10) returns 429
 *  4. 429 responses include Retry-After header and retryAfter body field
 *  5. Counter resets after window expires (fake timers — walletLimiter in-process Map)
 *  6. Different IPs/keys/wallets have independent counters
 *
 * All middleware is tested directly through a minimal express app that does NOT
 * import src/app.ts, so production runtime deps (helmet, cors, morgan, zod) are
 * not required.  express-rate-limit is mocked with a deterministic in-process
 * implementation.  Redis is fully mocked — no real Redis required.
 */

// ─── Mock express-rate-limit (not installed in test env) ─────────────────────
// Store counters per-instance so each makeGlobalApp() gets an independent counter.

type RlHandler = (req: import('express').Request, res: import('express').Response) => void;

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  keyGenerator?: (req: import('express').Request) => string;
  handler?: RlHandler;
}

jest.mock(
  'express-rate-limit',
  () =>
    (opts: RateLimitOptions) => {
      // Fresh counter map per rateLimit() call (i.e. per makeGlobalApp() invocation)
      const instanceCounters = new Map<string, { count: number; resetTime: number }>();

      return (
        req: import('express').Request,
        res: import('express').Response,
        next: () => void,
      ) => {
        const ip: string = (() => {
          const fwd = req.headers['x-forwarded-for'];
          return (
            (typeof fwd === 'string' ? fwd.split(',')[0].trim() : req.socket?.remoteAddress) ??
            '127.0.0.1'
          );
        })();
        const key = opts.keyGenerator ? opts.keyGenerator(req) : ip;
        const now = Date.now();

        let entry = instanceCounters.get(key);
        if (!entry || now > entry.resetTime) {
          entry = { count: 0, resetTime: now + opts.windowMs };
          instanceCounters.set(key, entry);
        }
        entry.count++;

        res.set('RateLimit-Limit', String(opts.max));
        res.set('RateLimit-Remaining', String(Math.max(0, opts.max - entry.count)));
        res.set('RateLimit-Reset', String(Math.ceil(entry.resetTime / 1000)));

        if (entry.count > opts.max) {
          const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
          res.set('Retry-After', String(retryAfter > 0 ? retryAfter : 60));
          if (opts.handler) {
            opts.handler(req, res);
          } else {
            res.status(429).json({
              error: opts.message ?? 'Too many requests',
              retryAfter: retryAfter > 0 ? retryAfter : 60,
            });
          }
          return;
        }

        next();
      };
    },
  { virtual: true },
);

// ─── Mock Redis ────────────────────────────────────────────────────────────────

const counters: Map<string, number> = new Map();
const ttls: Map<string, number> = new Map();

// Use jest.fn() with persistent implementations (not cleared by clearAllMocks)
// because clearAllMocks resets the mock *implementation* along with call history.
// We restore the implementation in beforeEach manually.

let redisMockImpl = {
  incr: jest.fn(async (key: string) => {
    const v = (counters.get(key) ?? 0) + 1;
    counters.set(key, v);
    return v;
  }),
  expire: jest.fn(async (key: string, sec: number) => {
    ttls.set(key, sec);
    return 1;
  }),
  ttl: jest.fn(async (key: string) => ttls.get(key) ?? 60),
  get: jest.fn(async () => null),
  setex: jest.fn(async () => 'OK'),
  keys: jest.fn(async () => [] as string[]),
  del: jest.fn(async () => 0),
  quit: jest.fn(async () => 'OK'),
  on: jest.fn(),
};

jest.mock('../../src/services/redis', () => ({ __esModule: true, default: redisMockImpl }));

// ─── Mock DB ───────────────────────────────────────────────────────────────────

import { MockPool, resetDb } from '../api/setup';
const mockPool = new MockPool();
jest.mock('../../src/db', () => ({
  pool: mockPool,
  migrate: jest.fn(),
  healthCheck: jest.fn(),
}));

// ─── Imports ───────────────────────────────────────────────────────────────────

import express, { Request, Response } from 'express';
import request from 'supertest';
import { createHash, randomBytes } from 'crypto';

import {
  globalLimiter,
  walletLimiter,
  clearWalletLimitStore,
} from '../../src/middleware/rate-limit';
import { apiKeyAuth } from '../../src/middleware/api-key-auth';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

async function seedApiKey(key: string, label = 'test'): Promise<void> {
  await mockPool.query(
    'INSERT INTO api_keys (key_hash, label) VALUES ($1, $2)',
    [sha256(key), label],
  );
}

/** Pre-seed Redis counter state so the next incr() returns count+1. */
function seedCounter(redisKey: string, count: number, ttlSec = 60): void {
  counters.set(redisKey, count);
  ttls.set(redisKey, ttlSec);
}

// ─── Test app factories ────────────────────────────────────────────────────────

/** Tests apiKeyAuth Redis-backed IP + key limits. */
function makeAuthApp() {
  const app = express();
  app.use(express.json());
  app.use(apiKeyAuth);
  app.get('/ping', (_req: Request, res: Response) => res.json({ ok: true }));
  return app;
}

/** Tests walletLimiter (in-process Map, limit=10/min). */
function makeTxApp() {
  const app = express();
  app.use(express.json());
  app.post('/tx', walletLimiter, (_req: Request, res: Response) => res.json({ ok: true }));
  return app;
}

/** Tests globalLimiter (mocked express-rate-limit, max=100/min). */
function makeGlobalApp() {
  const app = express();
  app.use(express.json());
  app.use(globalLimiter);
  app.get('/ping', (_req: Request, res: Response) => res.json({ ok: true }));
  return app;
}

// ─── Per-test reset ────────────────────────────────────────────────────────────

beforeEach(() => {
  resetDb();
  counters.clear();
  ttls.clear();
  clearWalletLimitStore();

  // Restore Redis mock implementations after jest.clearAllMocks() would wipe them.
  // We do NOT call jest.clearAllMocks() — instead reset call counts manually.
  redisMockImpl.incr.mockClear();
  redisMockImpl.expire.mockClear();
  redisMockImpl.ttl.mockClear();

  // Re-bind implementations so the fns still work after mockClear
  redisMockImpl.incr.mockImplementation(async (key: string) => {
    const v = (counters.get(key) ?? 0) + 1;
    counters.set(key, v);
    return v;
  });
  redisMockImpl.expire.mockImplementation(async (key: string, sec: number) => {
    ttls.set(key, sec);
    return 1;
  });
  redisMockImpl.ttl.mockImplementation(async (key: string) => ttls.get(key) ?? 60);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 1 — IP rate limit: requests above IP_LIMIT (30/min) return 429
// ═══════════════════════════════════════════════════════════════════════════════

describe('Test 1 – IP rate limit: too many requests from same IP', () => {
  it('returns 429 when IP counter exceeds IP_LIMIT (30 req/min)', async () => {
    const app = makeAuthApp();
    // Use X-Forwarded-For to control the IP seen by getIp()
    // The apiKeyAuth middleware reads x-forwarded-for first
    const testIp = '203.0.113.1';
    seedCounter(`rl:ip:${testIp}`, 31, 55);

    const res = await request(app).get('/ping').set('X-Forwarded-For', testIp);

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/rate limit exceeded/i);
    expect(typeof res.body.retryAfter).toBe('number');
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('returns 200 when IP counter is below IP_LIMIT', async () => {
    const app = makeAuthApp();
    const testIp = '203.0.113.2';
    seedCounter(`rl:ip:${testIp}`, 5, 60);

    const res = await request(app).get('/ping').set('X-Forwarded-For', testIp);
    expect([200, 404]).toContain(res.status);
  });

  it('globalLimiter enforces 100 req/min per IP', async () => {
    const app = makeGlobalApp(); // new app = fresh counter
    let lastRes: import('supertest').Response | null = null;
    for (let i = 0; i < 101; i++) {
      lastRes = await request(app).get('/ping');
    }
    expect(lastRes!.status).toBe(429);
    expect(lastRes!.headers['retry-after']).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 2 — API key rate limit: 121st request returns 429 (KEY_LIMIT=120)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Test 2 – API key rate limit: 121st request returns 429', () => {
  it('returns 429 when per-key Redis counter exceeds KEY_LIMIT (120 req/min)', async () => {
    const app = makeAuthApp();
    const key = randomBytes(16).toString('hex');
    await seedApiKey(key, 'ratelimit-key');

    seedCounter(`rl:key:${sha256(key)}`, 121, 45);

    const res = await request(app)
      .get('/ping')
      .set('Authorization', `Bearer ${key}`);

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/rate limit exceeded/i);
    expect(typeof res.body.retryAfter).toBe('number');
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('returns 200 when per-key counter is below KEY_LIMIT', async () => {
    const app = makeAuthApp();
    const key = randomBytes(16).toString('hex');
    await seedApiKey(key, 'under-limit-key');

    seedCounter(`rl:key:${sha256(key)}`, 10, 60);

    const res = await request(app)
      .get('/ping')
      .set('Authorization', `Bearer ${key}`);

    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 3 — Wallet rate limit: 11th transaction from same contributor → 429
// ═══════════════════════════════════════════════════════════════════════════════

describe('Test 3 – Wallet rate limit: 11th transaction returns 429', () => {
  const wallet = 'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBWE3ITMG4YOS';

  it('returns 429 on the 11th POST from the same wallet address', async () => {
    const app = makeTxApp();

    for (let i = 0; i < 10; i++) {
      const r = await request(app).post('/tx').send({ wallet });
      expect(r.status).toBe(200);
    }

    const res = await request(app).post('/tx').send({ wallet });
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/wallet rate limit exceeded/i);
    expect(res.headers['retry-after']).toBeDefined();
    expect(typeof res.body.retryAfter).toBe('number');
  });

  it('returns 200 on the first request from a wallet', async () => {
    // clearWalletLimitStore() is called in beforeEach — fresh state here
    const app = makeTxApp();
    const res = await request(app).post('/tx').send({ wallet });
    expect(res.status).toBe(200);
  });

  it('passes through when no wallet is provided (no wallet = skip limit)', async () => {
    const app = makeTxApp();
    const res = await request(app).post('/tx').send({});
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 4 — 429 includes Retry-After, X-RateLimit-Limit, -Remaining, -Reset
// ═══════════════════════════════════════════════════════════════════════════════

describe('Test 4 – 429 response includes required rate limit headers', () => {
  it('apiKeyAuth IP-limit 429: includes Retry-After and body.retryAfter', async () => {
    const app = makeAuthApp();
    const testIp = '203.0.113.10';
    seedCounter(`rl:ip:${testIp}`, 31, 55);

    const res = await request(app).get('/ping').set('X-Forwarded-For', testIp);
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(typeof res.body.retryAfter).toBe('number');
    expect(res.body.retryAfter).toBeGreaterThan(0);
  });

  it('apiKeyAuth key-limit 429: includes Retry-After and body.retryAfter', async () => {
    const app = makeAuthApp();
    const key = randomBytes(16).toString('hex');
    await seedApiKey(key);
    seedCounter(`rl:key:${sha256(key)}`, 121, 33);

    const res = await request(app)
      .get('/ping')
      .set('Authorization', `Bearer ${key}`);

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(typeof res.body.retryAfter).toBe('number');
  });

  it('walletLimiter 429: includes Retry-After and body.retryAfter', async () => {
    const app = makeTxApp();
    const wallet = 'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBWE3ITMG4YOS';

    for (let i = 0; i < 10; i++) {
      await request(app).post('/tx').send({ wallet });
    }
    const res = await request(app).post('/tx').send({ wallet });

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(typeof res.body.retryAfter).toBe('number');
  });

  it('globalLimiter 429: includes RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After', async () => {
    const app = makeGlobalApp();
    let lastRes: import('supertest').Response | null = null;
    for (let i = 0; i < 101; i++) {
      lastRes = await request(app).get('/ping');
    }

    expect(lastRes!.status).toBe(429);
    expect(lastRes!.headers['ratelimit-limit']).toBe('100');
    expect(Number(lastRes!.headers['ratelimit-remaining'])).toBeGreaterThanOrEqual(0);
    expect(lastRes!.headers['ratelimit-reset']).toBeDefined();
    expect(lastRes!.headers['retry-after']).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 5 — Counter resets after window expires (fake timers)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Test 5 – Counter resets after window expires (fake timers)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    clearWalletLimitStore();
  });

  afterEach(() => {
    jest.useRealTimers();
    clearWalletLimitStore();
  });

  it('walletLimiter: counter resets after 60s window, new requests succeed', async () => {
    const app = makeTxApp();
    const wallet = 'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBWE3ITMG4YOS';

    // Exhaust the 10-request limit (all happen at fake time T=0)
    for (let i = 0; i < 10; i++) {
      const r = await request(app).post('/tx').send({ wallet });
      expect(r.status).toBe(200);
    }

    // 11th is blocked
    const blocked = await request(app).post('/tx').send({ wallet });
    expect(blocked.status).toBe(429);

    // Advance past the 60s window — walletLimiter checks `now > entry.resetTime`
    jest.advanceTimersByTime(61_000);

    // After reset, the counter is fresh
    const afterReset = await request(app).post('/tx').send({ wallet });
    expect(afterReset.status).toBe(200);
  });

  it('Redis-backed IP counter: after TTL expiry (simulated), requests are allowed again', async () => {
    const app = makeAuthApp();
    const testIp = '203.0.113.20';
    const ipKey = `rl:ip:${testIp}`;

    seedCounter(ipKey, 31, 60);

    const blocked = await request(app).get('/ping').set('X-Forwarded-For', testIp);
    expect(blocked.status).toBe(429);

    // Simulate TTL expiry by clearing mock state
    counters.delete(ipKey);
    ttls.delete(ipKey);

    // Re-bind incr so fresh counter starts from 0
    redisMockImpl.incr.mockImplementation(async (key: string) => {
      const v = (counters.get(key) ?? 0) + 1;
      counters.set(key, v);
      return v;
    });

    jest.advanceTimersByTime(61_000);

    const afterReset = await request(app).get('/ping');
    expect([200, 404]).toContain(afterReset.status);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 6 — Different IPs/keys/wallets have independent counters
// ═══════════════════════════════════════════════════════════════════════════════

describe('Test 6 – Independent counters for different IPs, keys, and wallets', () => {
  it('rate-limiting IP-A does not affect IP-B', async () => {
    const app = makeAuthApp();
    seedCounter('rl:ip:10.0.0.1', 31, 60); // IP-A above limit
    seedCounter('rl:ip:10.0.0.2', 5, 60);  // IP-B below limit

    const resA = await request(app).get('/ping').set('X-Forwarded-For', '10.0.0.1');
    expect(resA.status).toBe(429);

    const resB = await request(app).get('/ping').set('X-Forwarded-For', '10.0.0.2');
    expect([200, 404]).toContain(resB.status);
  });

  it('rate-limiting key-A does not affect key-B', async () => {
    const app = makeAuthApp();
    const keyA = randomBytes(16).toString('hex');
    const keyB = randomBytes(16).toString('hex');
    await seedApiKey(keyA, 'key-a');
    await seedApiKey(keyB, 'key-b');

    seedCounter(`rl:key:${sha256(keyA)}`, 121, 60); // key-A above limit
    seedCounter(`rl:key:${sha256(keyB)}`, 10, 60);  // key-B below limit

    const resA = await request(app).get('/ping').set('Authorization', `Bearer ${keyA}`);
    expect(resA.status).toBe(429);

    const resB = await request(app).get('/ping').set('Authorization', `Bearer ${keyB}`);
    expect(resB.status).toBe(200);
  });

  it('rate-limiting wallet-A does not affect wallet-B', async () => {
    const app = makeTxApp();
    const walletA = 'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBWE3ITMG4YOS';
    const walletB = 'GBMAINTAINER000000000000000000000000000000000000000000000002';

    // Exhaust wallet-A
    for (let i = 0; i < 10; i++) {
      await request(app).post('/tx').send({ wallet: walletA });
    }
    const resA = await request(app).post('/tx').send({ wallet: walletA });
    expect(resA.status).toBe(429);

    // wallet-B's first request — independent counter
    const resB = await request(app).post('/tx').send({ wallet: walletB });
    expect(resB.status).toBe(200);
  });
});
