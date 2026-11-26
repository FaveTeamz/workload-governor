/**
 * Unit tests for replay protection middleware and auth schema validation.
 *
 * All tests use:
 *  - An in-memory mock Redis client (no live Redis required)
 *  - An injected ledger fetcher (no live Horizon required)
 *  - A minimal Express app with a single POST /protected route
 */

import request from 'supertest';
import express, { Request, Response } from 'express';
import {
  replayProtection,
  RedisClient,
} from '../../src/middleware/replayProtection';
import {
  validateSignedPayloadBase,
  isValidNonce,
  MAX_LEDGER_ADVANCE,
} from '../../src/schemas/auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** In-memory Redis mock that correctly models SET key value EX ttl NX. */
function makeRedis(): RedisClient & { store: Map<string, string>; callCount: number } {
  const store = new Map<string, string>();
  let callCount = 0;
  return {
    store,
    get callCount() {
      return callCount;
    },
    async set(
      key: string,
      value: string,
      _exMode: 'EX',
      _ttl: number,
      setMode: 'NX',
    ): Promise<'OK' | null> {
      callCount++;
      if (setMode === 'NX' && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    },
  };
}

/** Redis mock that always throws — simulates connection failure. */
function makeFailingRedis(): RedisClient {
  return {
    async set(): Promise<never> {
      throw new Error('ECONNREFUSED');
    },
  };
}

/** Build a minimal Express app that wraps a single POST /protected route. */
function buildApp(
  redis: RedisClient,
  currentLedger: number,
  nonceTtlSeconds = 600,
) {
  const app = express();
  app.use(express.json());
  app.post(
    '/protected',
    replayProtection({
      redisClient: redis,
      getLedger: async () => currentLedger,
      nonceTtlSeconds,
    }),
    (_req: Request, res: Response) => {
      res.status(200).json({ ok: true });
    },
  );
  return app;
}

/** A valid payload with ledger_sequence=1000, max_ledger=1050. */
function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    nonce: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    ledger_sequence: 1000,
    max_ledger: 1050,
    contributor: 'GBXXXXXXXXX',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Schema unit tests — validateSignedPayloadBase
// ---------------------------------------------------------------------------

describe('validateSignedPayloadBase', () => {
  it('returns no errors for a valid UUIDv4 nonce', () => {
    const errors = validateSignedPayloadBase({
      nonce: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      ledger_sequence: 1000,
      max_ledger: 1050,
    });
    expect(errors).toHaveLength(0);
  });

  it('returns no errors for a valid 64-char hex nonce', () => {
    const errors = validateSignedPayloadBase({
      nonce: 'a'.repeat(64),
      ledger_sequence: 500,
      max_ledger: 599,
    });
    expect(errors).toHaveLength(0);
  });

  it('reports error for missing nonce', () => {
    const errors = validateSignedPayloadBase({
      ledger_sequence: 1000,
      max_ledger: 1050,
    });
    expect(errors.some((e) => e.field === 'nonce')).toBe(true);
  });

  it('reports error for nonce that is not UUID or hex', () => {
    const errors = validateSignedPayloadBase({
      nonce: 'not-a-valid-nonce',
      ledger_sequence: 1000,
      max_ledger: 1050,
    });
    expect(errors.some((e) => e.field === 'nonce')).toBe(true);
  });

  it('reports error for non-integer ledger_sequence', () => {
    const errors = validateSignedPayloadBase({
      nonce: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      ledger_sequence: 'not-a-number',
      max_ledger: 1050,
    });
    expect(errors.some((e) => e.field === 'ledger_sequence')).toBe(true);
  });

  it('reports error for negative ledger_sequence', () => {
    const errors = validateSignedPayloadBase({
      nonce: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      ledger_sequence: -1,
      max_ledger: 100,
    });
    expect(errors.some((e) => e.field === 'ledger_sequence')).toBe(true);
  });

  it('reports error when max_ledger <= ledger_sequence', () => {
    const errors = validateSignedPayloadBase({
      nonce: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      ledger_sequence: 1000,
      max_ledger: 1000,
    });
    expect(errors.some((e) => e.field === 'max_ledger')).toBe(true);
  });

  it('reports error when window exceeds MAX_LEDGER_ADVANCE', () => {
    const errors = validateSignedPayloadBase({
      nonce: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      ledger_sequence: 1000,
      max_ledger: 1000 + MAX_LEDGER_ADVANCE + 1,
    });
    expect(errors.some((e) => e.field === 'max_ledger')).toBe(true);
  });

  it('allows a window of exactly MAX_LEDGER_ADVANCE', () => {
    const errors = validateSignedPayloadBase({
      nonce: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      ledger_sequence: 1000,
      max_ledger: 1000 + MAX_LEDGER_ADVANCE,
    });
    expect(errors).toHaveLength(0);
  });

  it('reports all invalid fields at once', () => {
    const errors = validateSignedPayloadBase({});
    const fields = errors.map((e) => e.field);
    expect(fields).toContain('nonce');
    expect(fields).toContain('ledger_sequence');
    expect(fields).toContain('max_ledger');
  });
});

// ---------------------------------------------------------------------------
// Schema unit tests — isValidNonce
// ---------------------------------------------------------------------------

describe('isValidNonce', () => {
  it('accepts a standard UUIDv4', () => {
    expect(isValidNonce('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true);
  });

  it('accepts a 64-char lowercase hex string', () => {
    expect(isValidNonce('a'.repeat(64))).toBe(true);
  });

  it('accepts a 64-char uppercase hex string', () => {
    expect(isValidNonce('A'.repeat(64))).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidNonce('')).toBe(false);
  });

  it('rejects a 63-char hex string (too short)', () => {
    expect(isValidNonce('a'.repeat(63))).toBe(false);
  });

  it('rejects a non-string', () => {
    expect(isValidNonce(12345)).toBe(false);
  });

  it('rejects a UUID with wrong version digit', () => {
    // version 5 UUID — not v4
    expect(isValidNonce('f47ac10b-58cc-5372-a567-0e02b2c3d479')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Middleware integration tests — happy path
// ---------------------------------------------------------------------------

describe('replayProtection middleware — happy path', () => {
  it('passes a valid first-time payload to the next handler', async () => {
    const redis = makeRedis();
    const app = buildApp(redis, 1000);

    const res = await request(app).post('/protected').send(validPayload());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('writes the nonce key to Redis on success', async () => {
    const redis = makeRedis();
    const app = buildApp(redis, 1000);

    await request(app).post('/protected').send(validPayload());
    expect(redis.store.has('nonce:f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Middleware integration tests — double submission (409)
// ---------------------------------------------------------------------------

describe('replayProtection middleware — double submission', () => {
  it('returns 409 when the same nonce is submitted twice', async () => {
    const redis = makeRedis();
    const app = buildApp(redis, 1000);
    const payload = validPayload();

    const first = await request(app).post('/protected').send(payload);
    expect(first.status).toBe(200);

    const second = await request(app).post('/protected').send(payload);
    expect(second.status).toBe(409);
  });

  it('409 response body names the conflict clearly', async () => {
    const redis = makeRedis();
    const app = buildApp(redis, 1000);
    const payload = validPayload();

    await request(app).post('/protected').send(payload);
    const second = await request(app).post('/protected').send(payload);

    expect(second.body.error).toMatch(/already consumed/i);
  });

  it('allows a second payload with a different nonce', async () => {
    const redis = makeRedis();
    const app = buildApp(redis, 1000);

    const first = await request(app)
      .post('/protected')
      .send(validPayload({ nonce: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' }));
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/protected')
      .send(validPayload({ nonce: 'a47ac10b-58cc-4372-a567-0e02b2c3d479' }));
    expect(second.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Middleware integration tests — expired ledger (400)
// ---------------------------------------------------------------------------

describe('replayProtection middleware — expired ledger', () => {
  it('returns 400 when current ledger equals max_ledger', async () => {
    const redis = makeRedis();
    // current ledger == max_ledger: payload has just expired
    const app = buildApp(redis, 1050);

    const res = await request(app).post('/protected').send(validPayload());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  it('returns 400 when current ledger is ahead of max_ledger', async () => {
    const redis = makeRedis();
    const app = buildApp(redis, 2000);

    const res = await request(app).post('/protected').send(validPayload());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  it('returns 400 for expired ledger before touching Redis', async () => {
    // Verifies that ledger check is ordered before the nonce write.
    const redis = makeRedis();
    const app = buildApp(redis, 1050);

    await request(app).post('/protected').send(validPayload());
    // Redis must not have been written — the ledger check came first.
    expect(redis.store.size).toBe(0);
  });

  it('passes when current ledger is one below max_ledger', async () => {
    const redis = makeRedis();
    const app = buildApp(redis, 1049); // current=1049, max=1050 → still valid

    const res = await request(app).post('/protected').send(validPayload());
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Middleware integration tests — schema errors (400)
// ---------------------------------------------------------------------------

describe('replayProtection middleware — schema validation', () => {
  it('returns 400 when nonce is missing', async () => {
    const redis = makeRedis();
    const app = buildApp(redis, 1000);
    const { nonce: _n, ...withoutNonce } = validPayload();

    const res = await request(app).post('/protected').send(withoutNonce);
    expect(res.status).toBe(400);
    expect(res.body.details).toBeDefined();
  });

  it('returns 400 when ledger_sequence is missing', async () => {
    const redis = makeRedis();
    const app = buildApp(redis, 1000);
    const { ledger_sequence: _l, ...body } = validPayload();

    const res = await request(app).post('/protected').send(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 when max_ledger window exceeds 100', async () => {
    const redis = makeRedis();
    const app = buildApp(redis, 1000);

    const res = await request(app)
      .post('/protected')
      .send(validPayload({ ledger_sequence: 1000, max_ledger: 1101 }));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Middleware integration tests — infrastructure failures (503)
// ---------------------------------------------------------------------------

describe('replayProtection middleware — infrastructure failures', () => {
  it('returns 503 when Redis throws on set', async () => {
    const app = buildApp(makeFailingRedis(), 1000);

    const res = await request(app).post('/protected').send(validPayload());
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/replay protection unavailable/i);
  });

  it('returns 503 when the ledger fetcher throws', async () => {
    const redis = makeRedis();
    const app = express();
    app.use(express.json());
    app.post(
      '/protected',
      replayProtection({
        redisClient: redis,
        getLedger: async () => {
          throw new Error('horizon timeout');
        },
      }),
      (_req, res) => res.status(200).json({ ok: true }),
    );

    const res = await request(app).post('/protected').send(validPayload());
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/ledger check unavailable/i);
  });
});
