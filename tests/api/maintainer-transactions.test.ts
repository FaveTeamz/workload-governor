import request from 'supertest';
import { Keypair, Account, BASE_FEE, Networks, Operation, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { createHash, randomBytes } from 'crypto';
import { MockPool, resetDb } from './setup';

const mockPool = new MockPool();
jest.mock('../../src/db', () => ({
  pool: mockPool,
  migrate: jest.fn(),
  healthCheck: jest.fn(),
}));

const redisCounters = new Map<string, number>();
const redisMock = {
  incr: jest.fn(async (key: string) => {
    const count = (redisCounters.get(key) ?? 0) + 1;
    redisCounters.set(key, count);
    return count;
  }),
  expire: jest.fn(async () => 1),
  ttl: jest.fn(async () => 60),
};
jest.mock('../../src/services/redis', () => ({ default: redisMock }));

jest.mock('../../src/soroban', () => ({
  SorobanService: jest.fn().mockImplementation(() => ({
    simulate: jest.fn().mockResolvedValue({ fee: '100', instructions: 0, readBytes: 0, writeBytes: 0 }),
    buildAssignTx: jest.fn().mockImplementation(() => stubTransaction()),
    buildCompleteTx: jest.fn().mockImplementation(() => stubTransaction()),
    buildRevokeTx: jest.fn().mockImplementation(() => stubTransaction()),
  })),
}));

import { createApp } from '../../src/app';

const app = createApp();
const maintainer = Keypair.random().publicKey();
const contributor = Keypair.random().publicKey();
const orgId = 'org-a';
const sequence = '12345678901';
const endpoints = ['assign', 'complete', 'revoke'] as const;

type AuthFixture = {
  key: string;
  maintainer: string;
  orgId: string;
  revokedAt?: string;
};

function stubTransaction(): Transaction {
  const account = new Account(Keypair.random().publicKey(), '0');
  return new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.inflation())
    .setTimeout(30)
    .build();
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

async function seedApiKey(fixture: AuthFixture): Promise<void> {
  const columns = ['key_hash', 'label', 'maintainer_address', 'org_id'];
  const values: unknown[] = [hashKey(fixture.key), 'maintainer-test', fixture.maintainer, fixture.orgId];
  if (fixture.revokedAt) {
    columns.push('revoked_at');
    values.push(fixture.revokedAt);
  }
  const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
  await mockPool.query(
    `INSERT INTO api_keys (${columns.join(', ')}) VALUES (${placeholders})`,
    values,
  );
}

async function seedMaintainer(address: string, org: string): Promise<void> {
  await mockPool.query(
    'INSERT INTO maintainers (address, org_id) VALUES ($1, $2)',
    [address, org],
  );
}

function body(overrides: Record<string, unknown> = {}) {
  return { maintainer, contributor, org_id: orgId, issue_id: 1, sequence, ...overrides };
}

beforeEach(() => {
  resetDb();
  redisCounters.clear();
  jest.clearAllMocks();
});

describe.each(endpoints)('POST /api/transactions/%s maintainer authorization', (endpoint) => {
  it('returns 200 for a registered maintainer with a valid API key', async () => {
    const key = randomBytes(16).toString('hex');
    await seedApiKey({ key, maintainer, orgId });
    await seedMaintainer(maintainer, orgId);

    const res = await request(app)
      .post(`/api/transactions/${endpoint}`)
      .set('Authorization', `Bearer ${key}`)
      .send(body());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('xdr');
  });

  it('returns 403 UnauthorizedMaintainer for an unregistered maintainer', async () => {
    const key = randomBytes(16).toString('hex');
    await seedApiKey({ key, maintainer, orgId });

    const res = await request(app)
      .post(`/api/transactions/${endpoint}`)
      .set('Authorization', `Bearer ${key}`)
      .send(body());

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('UnauthorizedMaintainer');
  });

  it('returns 401 when the API key is missing', async () => {
    const res = await request(app)
      .post(`/api/transactions/${endpoint}`)
      .send(body());

    expect(res.status).toBe(401);
  });

  it('returns 403 for an API key tied to a different organization', async () => {
    const key = randomBytes(16).toString('hex');
    await seedApiKey({ key, maintainer, orgId: 'org-other' });
    await seedMaintainer(maintainer, orgId);

    const res = await request(app)
      .post(`/api/transactions/${endpoint}`)
      .set('Authorization', `Bearer ${key}`)
      .send(body());

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('UnauthorizedMaintainer');
  });

  it('returns 401 for a revoked API key', async () => {
    const key = randomBytes(16).toString('hex');
    await seedApiKey({ key, maintainer, orgId, revokedAt: '2026-09-24T00:00:00.000Z' });
    await seedMaintainer(maintainer, orgId);

    const res = await request(app)
      .post(`/api/transactions/${endpoint}`)
      .set('Authorization', `Bearer ${key}`)
      .send(body());

    expect(res.status).toBe(401);
  });
});
