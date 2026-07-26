/**
 * Integration tests for API key auth and rate limiting (issue #216)
 *
 * Three scenarios:
 *  1. Valid API key → 200, counts against per-key limit (120/min)
 *  2. Missing/invalid API key → 401
 *  3. Rate limit exceeded → 429 with Retry-After header
 */

import request from 'supertest';
import { MockPool, resetDb } from './setup';

// ---- mock DB ----
const mockPool = new MockPool();
jest.mock('../../src/db', () => ({
  pool: mockPool,
  migrate: jest.fn(),
  healthCheck: jest.fn(),
}));

// ---- mock Redis ----
const counters: Map<string, number> = new Map();
const ttls: Map<string, number> = new Map();

const redisMock = {
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
  keys: jest.fn(async () => []),
  del: jest.fn(async () => 0),
  quit: jest.fn(async () => 'OK'),
  on: jest.fn(),
};

jest.mock('../../src/services/redis', () => ({
  __esModule: true,
  default: redisMock,
}));

import { createApp } from '../../src/app';
import { createHash, randomBytes } from 'crypto';

const app = createApp();

function sha256(s: string) {
  return createHash('sha256').update(s).digest('hex');
}

async function seedKey(key: string, label = 'test-key') {
  await mockPool.query(
    'INSERT INTO api_keys (key_hash, label) VALUES ($1, $2)',
    [sha256(key), label],
  );
}

beforeEach(() => {
  resetDb();
  counters.clear();
  ttls.clear();
  jest.clearAllMocks();
  process.env.ADMIN_TOKEN = 'admin-secret';
});

// ---- Scenario 1: valid API key is accepted --------------------------------

describe('Scenario 1 – valid API key', () => {
  it('returns 200 on a protected endpoint when a valid key is supplied', async () => {
    const key = randomBytes(16).toString('hex');
    await seedKey(key);

    const res = await request(app)
      .get('/api/issues')
      .set('Authorization', `Bearer ${key}`);

    expect([200, 404]).toContain(res.status); // 200 or 404 — not 401/429
  });

  it('increments the per-key Redis counter', async () => {
    const key = randomBytes(16).toString('hex');
    await seedKey(key);

    await request(app).get('/api/issues').set('Authorization', `Bearer ${key}`);

    expect(redisMock.incr).toHaveBeenCalledWith(
      expect.stringContaining(`rl:key:${sha256(key)}`),
    );
  });
});

// ---- Scenario 2: missing / invalid key → 401 -----------------------------

describe('Scenario 2 – missing or invalid API key', () => {
  it('returns 401 when an unknown Bearer token is presented', async () => {
    const res = await request(app)
      .get('/api/issues')
      .set('Authorization', 'Bearer totally-fake-key');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid api key/i);
  });

  it('falls through to IP rate-limit (not 401) when no Authorization header', async () => {
    const res = await request(app).get('/api/issues');
    expect(res.status).not.toBe(401);
    // IP counter should have been incremented
    expect(redisMock.incr).toHaveBeenCalledWith(expect.stringContaining('rl:ip:'));
  });
});

// ---- Scenario 3: rate limit exceeded → 429 + Retry-After -----------------

describe('Scenario 3 – rate limit exceeded', () => {
  it('returns 429 with Retry-After header when per-key limit is exceeded', async () => {
    const key = randomBytes(16).toString('hex');
    await seedKey(key);

    // Simulate counter already above KEY_LIMIT (120)
    const redisKey = `rl:key:${sha256(key)}`;
    counters.set(redisKey, 121);
    ttls.set(redisKey, 45);

    const res = await request(app)
      .get('/api/issues')
      .set('Authorization', `Bearer ${key}`);

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.body.error).toMatch(/rate limit exceeded/i);
    expect(typeof res.body.retryAfter).toBe('number');
  });

  it('returns 429 with Retry-After header when IP limit is exceeded', async () => {
    // Simulate counter already above IP_LIMIT (30) for this IP
    const ipKey = `rl:ip:127.0.0.1`;
    counters.set(ipKey, 31);
    ttls.set(ipKey, 55);

    const res = await request(app).get('/api/issues');

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.body.error).toMatch(/rate limit exceeded/i);
  });
});

// ---- POST /api/api-keys admin endpoint -----------------------------------

describe('POST /api/api-keys', () => {
  it('returns 401 without admin token', async () => {
    const res = await request(app).post('/api/api-keys').send({ label: 'ci' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when label is missing', async () => {
    const res = await request(app)
      .post('/api/api-keys')
      .set('Authorization', 'Bearer admin-secret')
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 201 with a key when admin token and label are valid', async () => {
    const res = await request(app)
      .post('/api/api-keys')
      .set('Authorization', 'Bearer admin-secret')
      .send({ label: 'my-service' });
    expect(res.status).toBe(201);
    expect(typeof res.body.key).toBe('string');
    expect(res.body.key.length).toBeGreaterThan(0);
  });
});

// ============================================================
// Issue #370 — comprehensive API key auth middleware tests
// Covers: missing key, malformed header, unknown hash, expired
// key (simulated), valid key, rate-limit exceeded (key + IP).
// Scope enforcement (read/write/admin) is NOT yet implemented
// in the middleware or DB schema — see placeholder todos below.
// ============================================================

describe('Issue #370 – comprehensive auth tests', () => {
  // ------------------------------------------------------------------
  // Test 1: missing Authorization header → IP fallback, NOT 401
  // ------------------------------------------------------------------
  it('returns non-401 when Authorization header is absent (IP rate-limit fallback)', async () => {
    counters.clear();
    const res = await request(app).get('/api/issues');
    expect(res.status).not.toBe(401);
    // IP counter must have been incremented
    expect(redisMock.incr).toHaveBeenCalledWith(expect.stringContaining('rl:ip:'));
  });

  // ------------------------------------------------------------------
  // Test 2: malformed header (no "Bearer " prefix) → treated as raw
  // token, not found in DB → 401
  // ------------------------------------------------------------------
  it('returns 401 for malformed Authorization header (missing Bearer prefix)', async () => {
    const res = await request(app)
      .get('/api/issues')
      .set('Authorization', 'Token definitely-not-a-bearer-key');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid api key/i);
  });

  // ------------------------------------------------------------------
  // Test 3: unknown key hash → 401 invalid api key
  // ------------------------------------------------------------------
  it('returns 401 for an unknown Bearer token (key hash not in DB)', async () => {
    const res = await request(app)
      .get('/api/issues')
      .set('Authorization', `Bearer ${randomBytes(16).toString('hex')}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid api key/i);
  });

  // ------------------------------------------------------------------
  // Test 4: expired key — simulated by seeding the key, then clearing
  // the DB (mimicking a key that existed and was later deleted/expired)
  // → 401 because hash is no longer present in the DB.
  // ------------------------------------------------------------------
  it('returns 401 for a key removed from DB (simulating expiry)', async () => {
    const key = randomBytes(16).toString('hex');
    // Seed the key so it would be valid
    await seedKey(key, 'expiry-test');
    // Now clear the DB to simulate the key being expired/deleted
    resetDb();

    const res = await request(app)
      .get('/api/issues')
      .set('Authorization', `Bearer ${key}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid api key/i);
  });

  // ------------------------------------------------------------------
  // Test 5: valid key, rate limit not exceeded → request passes through
  // (200 or 404 — neither 401 nor 429)
  // ------------------------------------------------------------------
  it('returns non-401/429 for a valid key when rate limit is not exceeded', async () => {
    const key = randomBytes(16).toString('hex');
    await seedKey(key, 'valid-key-test');

    const res = await request(app)
      .get('/api/issues')
      .set('Authorization', `Bearer ${key}`);
    expect([200, 404]).toContain(res.status);
    // Per-key counter must have been incremented
    expect(redisMock.incr).toHaveBeenCalledWith(
      expect.stringContaining(`rl:key:${sha256(key)}`),
    );
  });

  // ------------------------------------------------------------------
  // Test 6: per-key rate limit exceeded → 429 with Retry-After header
  // ------------------------------------------------------------------
  it('returns 429 with Retry-After when per-key limit (120 req/min) is exceeded', async () => {
    const key = randomBytes(16).toString('hex');
    await seedKey(key, 'ratelimit-key-test');

    // Pre-set the counter above KEY_LIMIT (120)
    const redisKey = `rl:key:${sha256(key)}`;
    counters.set(redisKey, 121);
    ttls.set(redisKey, 30);

    const res = await request(app)
      .get('/api/issues')
      .set('Authorization', `Bearer ${key}`);
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.body.error).toMatch(/rate limit exceeded/i);
    expect(typeof res.body.retryAfter).toBe('number');
  });

  // ------------------------------------------------------------------
  // Test 7: IP rate limit exceeded → 429 with Retry-After header
  // ------------------------------------------------------------------
  it('returns 429 with Retry-After when IP limit (30 req/min) is exceeded', async () => {
    const ipKey = 'rl:ip:127.0.0.1';
    counters.set(ipKey, 31);
    ttls.set(ipKey, 42);

    const res = await request(app).get('/api/issues');
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.body.error).toMatch(/rate limit exceeded/i);
  });

  // ------------------------------------------------------------------
  // Scope enforcement — NOT YET IMPLEMENTED
  // The current DB schema (api_keys table) has no `scope` or `expires_at`
  // columns, and the middleware does not enforce scopes.
  // These tests are placeholders for when scope support is added.
  // ------------------------------------------------------------------
  it.todo('valid read-scoped key on write endpoint returns 403');
  it.todo('valid admin-scoped key on admin endpoint succeeds');
  it.todo('write-scoped key on read endpoint succeeds');
});
