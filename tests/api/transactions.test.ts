/**
 * Integration tests for /api/transactions endpoints.
 * Covers: happy paths for all 5 operations, 400 validation errors, 429 rate limit,
 *         and idempotency key behaviour.
 */

import request from 'supertest';
import { Keypair, Transaction } from '@stellar/stellar-sdk';
import { MockPool, resetDb, tbl } from './setup';

const mockPool = new MockPool();
jest.mock('../../src/db', () => ({
  pool: mockPool,
  migrate: jest.fn(),
  healthCheck: jest.fn(),
}));

// ---------- Redis mock (required by idempotency + api-key-auth middleware) -
const redisStore = new Map<string, { value: string; expiresAt: number }>();

jest.mock('../../src/services/redis', () => {
  const store = redisStore;
  const now = () => Date.now();

  function alive(key: string): boolean {
    const entry = store.get(key);
    return !!entry && now() < entry.expiresAt;
  }

  const mockRedis = {
    get: jest.fn(async (key: string) => {
      return alive(key) ? store.get(key)!.value : null;
    }),
    setex: jest.fn(async (key: string, ttl: number, val: string) => {
      store.set(key, { value: val, expiresAt: now() + ttl * 1000 });
      return 'OK';
    }),
    set: jest.fn(async (key: string, val: string) => {
      store.set(key, { value: val, expiresAt: Infinity });
      return 'OK';
    }),
    del: jest.fn(async (...keys: string[]) => {
      keys.forEach((k) => store.delete(k));
      return keys.length;
    }),
    incr: jest.fn(async (key: string) => {
      const cur = alive(key) ? parseInt(store.get(key)!.value, 10) : 0;
      const next = cur + 1;
      // Preserve TTL if already set, otherwise no expiry
      const existing = store.get(key);
      store.set(key, {
        value: String(next),
        expiresAt: existing ? existing.expiresAt : Infinity,
      });
      return next;
    }),
    expire: jest.fn(async (key: string, ttl: number) => {
      const entry = store.get(key);
      if (entry) {
        store.set(key, { value: entry.value, expiresAt: now() + ttl * 1000 });
        return 1;
      }
      return 0;
    }),
    ttl: jest.fn(async (key: string) => {
      const entry = store.get(key);
      if (!entry || now() >= entry.expiresAt) return -2;
      return Math.ceil((entry.expiresAt - now()) / 1000);
    }),
    keys: jest.fn(async () => []),
    on: jest.fn(),
    quit: jest.fn(async () => 'OK'),
  };

  return {
    __esModule: true,
    default: mockRedis,
    getCache: jest.fn(async (key: string) => {
      const raw = alive(key) ? store.get(key)!.value : null;
      return raw ? JSON.parse(raw) : null;
    }),
    setCache: jest.fn(async (key: string, value: unknown, ttl = 30) => {
      store.set(key, { value: JSON.stringify(value), expiresAt: now() + ttl * 1000 });
    }),
    invalidateCache: jest.fn(async () => {}),
    getMetrics: jest.fn(() => ({ hits: 0, misses: 0 })),
    closeRedis: jest.fn(async () => {}),
  };
});

// Mock SorobanService so tests don't need a real Soroban node
jest.mock('../../src/soroban', () => {
  const { Keypair: _Keypair, TransactionBuilder, Networks, Account, Operation, BASE_FEE } =
    jest.requireActual('@stellar/stellar-sdk');
  function stubTx(): Transaction {
    const src = _Keypair.random().publicKey();
    const account = new Account(src, '0');
    return new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.inflation())
      .setTimeout(30)
      .build();
  }
  return {
    SorobanService: jest.fn().mockImplementation(() => ({
      simulate: jest.fn().mockResolvedValue({ fee: '100', instructions: 0, readBytes: 0, writeBytes: 0 }),
      buildApplyTx: jest.fn().mockReturnValue(stubTx()),
      buildWithdrawTx: jest.fn().mockReturnValue(stubTx()),
      buildAssignTx: jest.fn().mockReturnValue(stubTx()),
      buildCompleteTx: jest.fn().mockReturnValue(stubTx()),
      buildRevokeTx: jest.fn().mockReturnValue(stubTx()),
    })),
  };
});

import { createApp } from '../../src/app';

const app = createApp();
const contributor = Keypair.random().publicKey();
const maintainer = Keypair.random().publicKey();
const SEQ = '12345678901';

afterEach(() => {
  resetDb();
  redisStore.clear();
});

describe('POST /api/transactions/apply', () => {
  it('returns 400 when contributor address is invalid', async () => {
    const res = await request(app)
      .post('/api/transactions/apply')
      .send({ contributor: 'NOT_AN_ADDR', org_id: 'org-a', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'contributor' })]),
    );
  });

  it('returns 400 when org_id is empty', async () => {
    const res = await request(app)
      .post('/api/transactions/apply')
      .send({ contributor, org_id: '', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(400);
  });

  it('returns 400 when issue_id is zero', async () => {
    const res = await request(app)
      .post('/api/transactions/apply')
      .send({ contributor, org_id: 'org-a', issue_id: 0, sequence: SEQ });
    expect(res.status).toBe(400);
  });

  it('returns 400 when issue_id is negative', async () => {
    const res = await request(app)
      .post('/api/transactions/apply')
      .send({ contributor, org_id: 'org-a', issue_id: -1, sequence: SEQ });
    expect(res.status).toBe(400);
  });

  it('fetches sequence number automatically when sequence is missing', async () => {
    const res = await request(app)
      .post('/api/transactions/apply')
      .send({ contributor, org_id: 'org-a', issue_id: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('xdr');
    expect(res.body).toHaveProperty('fee');
    expect(res.body).toHaveProperty('network_passphrase');
  });

  it('returns 200 with XDR, fee, and network_passphrase for valid inputs', async () => {
    const res = await request(app)
      .post('/api/transactions/apply')
      .send({ contributor, org_id: 'org-a', issue_id: '1', sequence: SEQ });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('xdr');
    expect(res.body).toHaveProperty('fee');
    expect(res.body).toHaveProperty('network_passphrase');
  });

  it('returns 409 when contributor has already applied', async () => {
    tbl('applications').push({
      id: 101,
      contributor,
      org_id: 'org-a',
      issue_id: 1,
      status: 'pending',
    });

    const res = await request(app)
      .post('/api/transactions/apply')
      .send({ contributor, org_id: 'org-a', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already applied/i);
  });

  it('returns 429 when application cap is reached', async () => {
    for (let i = 1; i <= 15; i++) {
      tbl('applications').push({
        id: i,
        contributor,
        org_id: 'other-org',
        issue_id: i,
        status: 'pending',
      });
    }

    const res = await request(app)
      .post('/api/transactions/apply')
      .send({ contributor, org_id: 'org-a', issue_id: 99, sequence: SEQ });
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/cap reached/i);
    expect(res.body.details).toHaveProperty('cap_type');
  });
});

describe('POST /api/transactions/withdraw', () => {
  it('returns 400 for invalid contributor', async () => {
    const res = await request(app)
      .post('/api/transactions/withdraw')
      .send({ contributor: 'bad', org_id: 'org-a', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(400);
  });

  it('returns 200 for valid inputs', async () => {
    const res = await request(app)
      .post('/api/transactions/withdraw')
      .send({ contributor, org_id: 'org-a', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('xdr');
  });
});

describe('POST /api/transactions/assign', () => {
  it('returns 400 when maintainer is missing', async () => {
    const res = await request(app)
      .post('/api/transactions/assign')
      .send({ contributor, org_id: 'org-a', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'maintainer' })]),
    );
  });

  it('returns 400 when contributor address is invalid', async () => {
    const res = await request(app)
      .post('/api/transactions/assign')
      .send({ maintainer, contributor: 'bad', org_id: 'org-a', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(400);
  });

  it('returns 200 for valid inputs', async () => {
    const res = await request(app)
      .post('/api/transactions/assign')
      .send({ maintainer, contributor, org_id: 'org-a', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('xdr');
  });
});

describe('POST /api/transactions/complete', () => {
  it('returns 400 for invalid maintainer', async () => {
    const res = await request(app)
      .post('/api/transactions/complete')
      .send({ maintainer: 'nope', contributor, org_id: 'org-a', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(400);
  });

  it('returns 200 for valid inputs', async () => {
    const res = await request(app)
      .post('/api/transactions/complete')
      .send({ maintainer, contributor, org_id: 'org-a', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('xdr');
  });
});

describe('POST /api/transactions/revoke', () => {
  it('returns 400 for invalid contributor', async () => {
    const res = await request(app)
      .post('/api/transactions/revoke')
      .send({ maintainer, contributor: 'bad', org_id: 'org-a', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(400);
  });

  it('returns 200 for valid inputs', async () => {
    const res = await request(app)
      .post('/api/transactions/revoke')
      .send({ maintainer, contributor, org_id: 'org-a', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('xdr');
  });
});

describe('Rate limiting on /api/transactions', () => {
  it('returns 429 after exceeding wallet rate limit', async () => {
    const wallet = Keypair.random().publicKey();
    // walletLimiter allows 10 per minute per wallet; body.wallet is used as key
    const responses = await Promise.all(
      Array.from({ length: 11 }, () =>
        request(app)
          .post('/api/transactions/apply')
          .send({ contributor: wallet, org_id: 'org-a', issue_id: 1, sequence: SEQ, wallet }),
      ),
    );
    const statuses = responses.map((r) => r.status);
    expect(statuses).toContain(429);
    const tooMany = responses.find((r) => r.status === 429)!;
    expect(tooMany.body).toHaveProperty('error');
    expect(tooMany.body).toHaveProperty('retryAfter');
  });
});

// =============================================================================
// Idempotency-Key tests (API-001)
// =============================================================================

describe('Idempotency-Key on POST /api/transactions/apply', () => {
  const validBody = {
    contributor,
    org_id: 'org-a',
    issue_id: 1,
    sequence: SEQ,
  };

  it('processes a request normally when no Idempotency-Key header is present', async () => {
    const res = await request(app)
      .post('/api/transactions/apply')
      .send(validBody);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('xdr');
  });

  it('returns 200 on first request with an Idempotency-Key', async () => {
    const res = await request(app)
      .post('/api/transactions/apply')
      .set('Idempotency-Key', 'unique-key-001')
      .send(validBody);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('xdr');
  });

  it('replays the cached response for a duplicate Idempotency-Key', async () => {
    const iKey = 'replay-key-001';

    // First request — populates cache
    const first = await request(app)
      .post('/api/transactions/apply')
      .set('Idempotency-Key', iKey)
      .send(validBody);
    expect(first.status).toBe(200);

    // Second request with same key — should get cached response
    const second = await request(app)
      .post('/api/transactions/apply')
      .set('Idempotency-Key', iKey)
      .send(validBody);
    expect(second.status).toBe(200);
    // Body must match the original cached response
    expect(second.body).toEqual(first.body);
  });

  it('returns 409 Conflict when the same key is in-flight (pending state)', async () => {
    const iKey = 'concurrent-key-001';

    // Manually inject a "pending" sentinel into the Redis mock store
    redisStore.set(`idemp:${iKey}`, {
      value: JSON.stringify({ status: 'pending', code: 0, body: null }),
      expiresAt: Date.now() + 300_000,
    });

    const res = await request(app)
      .post('/api/transactions/apply')
      .set('Idempotency-Key', iKey)
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error', 'conflict');
  });

  it('uses separate cache entries for different Idempotency-Key values', async () => {
    const res1 = await request(app)
      .post('/api/transactions/apply')
      .set('Idempotency-Key', 'key-aaa')
      .send(validBody);

    const res2 = await request(app)
      .post('/api/transactions/apply')
      .set('Idempotency-Key', 'key-bbb')
      .send(validBody);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    // Both should be independent successful responses
    expect(res1.body).toHaveProperty('xdr');
    expect(res2.body).toHaveProperty('xdr');
  });

  it('ignores an empty Idempotency-Key header and processes normally', async () => {
    const res = await request(app)
      .post('/api/transactions/apply')
      .set('Idempotency-Key', '')
      .send(validBody);
    // Empty key → treated as no header → normal processing
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('xdr');
  });
});
