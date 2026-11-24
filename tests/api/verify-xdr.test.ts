/**
 * Integration tests for POST /api/verify-xdr
 *
 * Covers:
 *  - 400 for malformed base64 / invalid XDR (no stack traces in response)
 *  - 413 for payloads exceeding 64 KB (schema-level rejection)
 *  - 400 for network passphrase mismatch
 *  - 200 with sanitized response for valid XDR
 */

import request from 'supertest';
import {
  Keypair,
  TransactionBuilder,
  Networks,
  Account,
  Operation,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { MockPool, resetDb } from './setup';

// ---------- DB mock -------------------------------------------------------
const mockPool = new MockPool();
jest.mock('../../src/db', () => ({
  pool: mockPool,
  migrate: jest.fn(),
  healthCheck: jest.fn(),
}));

// ---------- Redis mock ----------------------------------------------------
jest.mock('../../src/services/redis', () => {
  const store = new Map<string, string>();
  const mockRedis = {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    setex: jest.fn(async (key: string, _ttl: number, val: string) => {
      store.set(key, val);
    }),
    set: jest.fn(async (key: string, val: string) => { store.set(key, val); }),
    del: jest.fn(async (...keys: string[]) => { keys.forEach((k) => store.delete(k)); }),
    incr: jest.fn(async (key: string) => {
      const n = parseInt(store.get(key) ?? '0', 10) + 1;
      store.set(key, String(n));
      return n;
    }),
    expire: jest.fn(async () => 1),
    ttl: jest.fn(async () => 60),
    keys: jest.fn(async () => []),
    on: jest.fn(),
    quit: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockRedis,
    getCache: jest.fn(async (key: string) => {
      const val = store.get(key);
      return val ? JSON.parse(val) : null;
    }),
    setCache: jest.fn(async (key: string, value: unknown, ttl: number = 30) => {
      store.set(key, JSON.stringify(value));
      void ttl;
    }),
    invalidateCache: jest.fn(async () => {}),
    getMetrics: jest.fn(() => ({ hits: 0, misses: 0 })),
    closeRedis: jest.fn(async () => {}),
  };
});

import { createApp } from '../../src/app';

const app = createApp();

// ---------- Helpers -------------------------------------------------------

/** Build a minimal valid Testnet XDR string */
function buildValidXdr(network = Networks.TESTNET): string {
  const kp = Keypair.random();
  const account = new Account(kp.publicKey(), '0');
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network,
  })
    .addOperation(
      Operation.bumpSequence({ bumpTo: '100' }),
    )
    .setTimeout(30)
    .build();
  return tx.toXDR();
}

/** Build an XDR string that exceeds 64 KB */
function buildOversizedXdr(): string {
  // 64 KB + 1 byte of padding 'A' characters (valid base64 alphabet)
  return 'A'.repeat(64 * 1024 + 1);
}

afterEach(() => resetDb());

// ---------- Tests ---------------------------------------------------------

describe('POST /api/verify-xdr', () => {
  // -------------------------------------------------------------------------
  // 400 – Missing / empty body
  // -------------------------------------------------------------------------
  it('returns 400 when body is missing', async () => {
    const res = await request(app).post('/api/verify-xdr').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'validation failed');
    // Must NOT expose stack traces
    expect(JSON.stringify(res.body)).not.toMatch(/at Object\.|Error:/);
  });

  it('returns 400 when xdr field is empty string', async () => {
    const res = await request(app).post('/api/verify-xdr').send({ xdr: '' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'validation failed');
  });

  // -------------------------------------------------------------------------
  // 400 – Malformed base64
  // -------------------------------------------------------------------------
  it('returns 400 for non-base64 characters', async () => {
    const res = await request(app)
      .post('/api/verify-xdr')
      .send({ xdr: 'not!!valid&&base64@@' });
    expect(res.status).toBe(400);
    // Schema-level base64 check fires first
    expect(JSON.stringify(res.body)).toMatch(/base64|validation/i);
    expect(JSON.stringify(res.body)).not.toMatch(/at Object\.|Error:/);
  });

  it('returns 400 for valid base64 that is not a Stellar XDR envelope', async () => {
    // Valid base64 but garbage XDR content
    const res = await request(app)
      .post('/api/verify-xdr')
      .send({ xdr: Buffer.from('this is definitely not xdr').toString('base64') });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'invalid_xdr');
    // No stack traces
    expect(JSON.stringify(res.body)).not.toMatch(/at Object\.|Error:/);
    expect(JSON.stringify(res.body)).not.toMatch(/stack/i);
  });

  it('returns 400 for a truncated/corrupted XDR string', async () => {
    const validXdr = buildValidXdr();
    const corrupted = validXdr.slice(0, Math.floor(validXdr.length / 2));
    const res = await request(app)
      .post('/api/verify-xdr')
      .send({ xdr: corrupted });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'invalid_xdr');
    expect(JSON.stringify(res.body)).not.toMatch(/at Object\.|Error:/);
  });

  // -------------------------------------------------------------------------
  // 413 – Oversized payload (64 KB limit enforced by schema)
  // -------------------------------------------------------------------------
  it('returns 400 (schema rejection) for xdr exceeding 64 KB', async () => {
    const oversized = buildOversizedXdr();
    const res = await request(app)
      .post('/api/verify-xdr')
      .send({ xdr: oversized });
    // Zod .max() triggers a 400 validation error before the SDK is ever called
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/64|size|maximum/i);
  });

  // -------------------------------------------------------------------------
  // 400 – Network mismatch
  // -------------------------------------------------------------------------
  it('returns 400 when mainnet XDR is submitted with network=testnet', async () => {
    const mainnetXdr = buildValidXdr(Networks.PUBLIC);
    const res = await request(app)
      .post('/api/verify-xdr')
      .send({ xdr: mainnetXdr, network: 'testnet' });
    // The SDK will fail to parse mainnet XDR against testnet passphrase
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/at Object\.|Error:/);
  });

  it('returns 400 for invalid network value', async () => {
    const validXdr = buildValidXdr();
    const res = await request(app)
      .post('/api/verify-xdr')
      .send({ xdr: validXdr, network: 'devnet' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'validation failed');
  });

  // -------------------------------------------------------------------------
  // 200 – Happy path
  // -------------------------------------------------------------------------
  it('returns 200 with sanitized response for a valid Testnet XDR', async () => {
    const validXdr = buildValidXdr(Networks.TESTNET);
    const res = await request(app)
      .post('/api/verify-xdr')
      .send({ xdr: validXdr, network: 'testnet' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      valid: true,
      hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      fee: expect.any(String),
      sequence: expect.any(String),
      source: expect.stringMatching(/^G[A-Z2-7]{55}$/),
      operations: expect.arrayContaining([
        expect.objectContaining({ type: expect.any(String) }),
      ]),
      operationCount: 1,
      network: 'testnet',
    });
    // Response must NOT contain stack traces or internal error messages
    expect(JSON.stringify(res.body)).not.toMatch(/at Object\.|Error:/);
  });

  it('returns 200 with sanitized response when no network specified (defaults to testnet)', async () => {
    const validXdr = buildValidXdr(Networks.TESTNET);
    const res = await request(app)
      .post('/api/verify-xdr')
      .send({ xdr: validXdr });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('valid', true);
    expect(res.body).toHaveProperty('hash');
    expect(res.body).toHaveProperty('operationCount', 1);
  });

  // -------------------------------------------------------------------------
  // Error sanitization: SDK internals must never reach the client
  // -------------------------------------------------------------------------
  it('does not expose Error class names or SDK internals on parse failure', async () => {
    const res = await request(app)
      .post('/api/verify-xdr')
      .send({ xdr: Buffer.from('bad data').toString('base64') });
    expect(res.status).toBe(400);
    const body = JSON.stringify(res.body);
    // These patterns indicate a raw SDK error was leaked
    expect(body).not.toMatch(/TypeError|SyntaxError|RangeError/);
    expect(body).not.toMatch(/xdr\.js|stellar-sdk/i);
    expect(body).not.toMatch(/stack/i);
  });
});
