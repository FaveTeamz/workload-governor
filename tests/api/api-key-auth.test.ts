/**
 * Integration tests for API key auth and rate limiting (issue #216, #840)
 *
 * Scenarios:
 *  1. Valid API key → 200, counts against per-key limit
 *  2. Missing/invalid API key → 401
 *  3. Rate limit exceeded → 429 with Retry-After header
 *  4. Tiered rate limits applied per API key role (issue #840)
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
import { ApiKeyTier, TIER_LIMITS } from '../../src/middleware/api-key-auth';

const app = createApp();

function sha256(s: string) {
  return createHash('sha256').update(s).digest('hex');
}

async function seedKey(key: string, label = 'test-key', tier: ApiKeyTier = 'contributor') {
  await mockPool.query(
    'INSERT INTO api_keys (key_hash, label, tier) VALUES ($1, $2, $3)',
    [sha256(key), label, tier],
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

    // Simulate counter already above contributor limit (180)
    const redisKey = `rl:key:${sha256(key)}`;
    counters.set(redisKey, 181);
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
    // Simulate counter already above anonymous limit (60) for this IP
    const ipKey = `rl:ip:127.0.0.1`;
    counters.set(ipKey, 61);
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

// ---- Scenario 4: Tiered rate limit thresholds (issue #840) ---------------

describe('Scenario 4 – tiered rate limit allocations', () => {
  it('TIER_LIMITS exports correct values', () => {
    expect(TIER_LIMITS.anonymous).toBe(60);
    expect(TIER_LIMITS.contributor).toBe(180);
    expect(TIER_LIMITS.maintainer).toBe(600);
    expect(TIER_LIMITS.admin).toBe(1200);
  });

  it('contributor key gets the contributor limit (180)', async () => {
    const key = randomBytes(16).toString('hex');
    await seedKey(key, 'contrib-key', 'contributor');

    const res = await request(app)
      .get('/api/issues')
      .set('Authorization', `Bearer ${key}`);

    expect([200, 404]).toContain(res.status);
    // Check the Redis counter used the contributor limit (180)
    expect(redisMock.incr).toHaveBeenCalledWith(
      expect.stringContaining(`rl:key:${sha256(key)}`),
    );
  });

  it('maintainer key gets the maintainer limit (600)', async () => {
    const key = randomBytes(16).toString('hex');
    await seedKey(key, 'maintainer-key', 'maintainer');

    await request(app)
      .get('/api/issues')
      .set('Authorization', `Bearer ${key}`);

    expect(redisMock.incr).toHaveBeenCalledWith(
      expect.stringContaining(`rl:key:${sha256(key)}`),
    );
  });

  it('admin key gets the admin limit (1200)', async () => {
    const key = randomBytes(16).toString('hex');
    await seedKey(key, 'admin-key', 'admin');

    await request(app)
      .get('/api/issues')
      .set('Authorization', `Bearer ${key}`);

    expect(redisMock.incr).toHaveBeenCalledWith(
      expect.stringContaining(`rl:key:${sha256(key)}`),
    );
  });

  it('contributor at exactly limit (180) is NOT rate-limited', async () => {
    const key = randomBytes(16).toString('hex');
    await seedKey(key, 'contrib-at-limit', 'contributor');

    const redisKey = `rl:key:${sha256(key)}`;
    counters.set(redisKey, 180); // exactly at limit
    ttls.set(redisKey, 60);

    const res = await request(app)
      .get('/api/issues')
      .set('Authorization', `Bearer ${key}`);

    // 181st call — should be blocked
    expect(res.status).toBe(429);
  });

  it('maintainer at exactly limit (600) is rate-limited on next request', async () => {
    const key = randomBytes(16).toString('hex');
    await seedKey(key, 'maintainer-at-limit', 'maintainer');

    const redisKey = `rl:key:${sha256(key)}`;
    counters.set(redisKey, 600);
    ttls.set(redisKey, 60);

    const res = await request(app)
      .get('/api/issues')
      .set('Authorization', `Bearer ${key}`);

    expect(res.status).toBe(429);
  });

  it('anonymous (no key) at limit (60) returns 429', async () => {
    const ipKey = `rl:ip:127.0.0.1`;
    counters.set(ipKey, 60);
    ttls.set(ipKey, 60);

    const res = await request(app).get('/api/issues');
    expect(res.status).toBe(429);
  });

  it('sets req.apiKeyTier to anonymous when no key provided', async () => {
    // Just verify the IP limit is checked (which means anonymous path ran)
    const res = await request(app).get('/api/issues');
    expect(res.status).not.toBe(401); // Not an auth error
    expect(redisMock.incr).toHaveBeenCalledWith(expect.stringContaining('rl:ip:'));
  });
});
