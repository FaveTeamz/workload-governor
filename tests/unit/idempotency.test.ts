/**
 * Unit tests for idempotency key support on POST /transactions/submit
 * Issue #557
 *
 * Tests:
 *   - Duplicate key returns cached response with `idempotent: true`
 *   - Fresh key processes normally and stores result in Redis
 *   - Missing key processes normally without any cache interaction
 */

import request from 'supertest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks must be declared before any imports that trigger module resolution
// ─────────────────────────────────────────────────────────────────────────────

// Track calls so individual tests can make assertions
const mockGetCache = jest.fn();
const mockSetCache = jest.fn();

jest.mock('../../src/services/redis', () => ({
  getCache: mockGetCache,
  setCache: mockSetCache,
  invalidateCache: jest.fn(),
  getMetrics: jest.fn(() => ({ hits: 0, misses: 0 })),
  default: { quit: jest.fn() },
}));

// Mock database (required by app bootstrap)
jest.mock('../../src/db', () => ({
  pool: { query: jest.fn(), end: jest.fn() },
  migrate: jest.fn(),
  healthCheck: jest.fn(),
}));

// Mock XDR verifier — succeeds by default, individual tests can override
const mockVerifyTransactionXdr = jest.fn();
jest.mock('../../src/xdrVerifier', () => ({
  verifyTransactionXdr: mockVerifyTransactionXdr,
}));

// Mock SorobanService — submitTransaction succeeds by default
const mockSubmitTransaction = jest.fn();
jest.mock('../../src/soroban', () => ({
  SorobanService: jest.fn().mockImplementation(() => ({
    simulate: jest.fn(),
    submitTransaction: mockSubmitTransaction,
    buildApplyTx: jest.fn(),
    buildWithdrawTx: jest.fn(),
    buildAssignTx: jest.fn(),
    buildCompleteTx: jest.fn(),
    buildRevokeTx: jest.fn(),
  })),
}));

// Mock the stellar-sdk dynamic import used inside the /submit handler
jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...actual,
    // The handler does `const { Transaction, xdr } = await import('@stellar/stellar-sdk')`
    // Jest resolves dynamic imports as the same module, so we just need the actual exports
    // to be intact. No override needed beyond what actual provides.
  };
});

import { createApp } from '../../src/app';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const app = createApp();

/** A minimal (fake) base64 XDR string — content doesn't matter because we mock verification */
const FAKE_XDR = Buffer.from('fake-xdr-payload').toString('base64');

const SUCCESSFUL_VERIFICATION = {
  ok: true as const,
  signerAddress: 'GABC1234',
  contractId: 'CTEST',
};

const CACHED_RESPONSE = {
  hash: 'cached-hash-abc',
  status: 'SUCCESS',
};

beforeEach(() => {
  jest.clearAllMocks();

  // Default: verification passes
  mockVerifyTransactionXdr.mockReturnValue(SUCCESSFUL_VERIFICATION);

  // Default: submission succeeds
  mockSubmitTransaction.mockResolvedValue({
    hash: 'fresh-hash-xyz',
    status: 'SUCCESS',
  });

  // Default: cache miss
  mockGetCache.mockResolvedValue(null);

  // Default: setCache is a no-op
  mockSetCache.mockResolvedValue(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/transactions/submit — idempotency key', () => {
  describe('duplicate key returns cached response', () => {
    it('returns 200 with the cached response body', async () => {
      mockGetCache.mockResolvedValue(CACHED_RESPONSE);

      const res = await request(app)
        .post('/api/transactions/submit')
        .set('Idempotency-Key', 'test-key-001')
        .send({ signed_xdr: FAKE_XDR });

      expect(res.status).toBe(200);
      expect(res.body.hash).toBe(CACHED_RESPONSE.hash);
      expect(res.body.status).toBe(CACHED_RESPONSE.status);
    });

    it('adds `idempotent: true` to the response', async () => {
      mockGetCache.mockResolvedValue(CACHED_RESPONSE);

      const res = await request(app)
        .post('/api/transactions/submit')
        .set('Idempotency-Key', 'test-key-001')
        .send({ signed_xdr: FAKE_XDR });

      expect(res.body.idempotent).toBe(true);
    });

    it('does not call verifyTransactionXdr when cache hit', async () => {
      mockGetCache.mockResolvedValue(CACHED_RESPONSE);

      await request(app)
        .post('/api/transactions/submit')
        .set('Idempotency-Key', 'test-key-001')
        .send({ signed_xdr: FAKE_XDR });

      expect(mockVerifyTransactionXdr).not.toHaveBeenCalled();
    });

    it('does not call submitTransaction when cache hit', async () => {
      mockGetCache.mockResolvedValue(CACHED_RESPONSE);

      await request(app)
        .post('/api/transactions/submit')
        .set('Idempotency-Key', 'test-key-001')
        .send({ signed_xdr: FAKE_XDR });

      expect(mockSubmitTransaction).not.toHaveBeenCalled();
    });

    it('looks up the cache with the correct prefixed key', async () => {
      mockGetCache.mockResolvedValue(CACHED_RESPONSE);

      await request(app)
        .post('/api/transactions/submit')
        .set('Idempotency-Key', 'my-unique-key-99')
        .send({ signed_xdr: FAKE_XDR });

      expect(mockGetCache).toHaveBeenCalledWith('idempotency:my-unique-key-99');
    });
  });

  describe('fresh key stores result in Redis', () => {
    it('returns 200 with the new transaction response', async () => {
      const res = await request(app)
        .post('/api/transactions/submit')
        .set('Idempotency-Key', 'fresh-key-001')
        .send({ signed_xdr: FAKE_XDR });

      expect(res.status).toBe(200);
      expect(res.body.hash).toBe('fresh-hash-xyz');
      expect(res.body.status).toBe('SUCCESS');
    });

    it('does not include `idempotent` field on a fresh submission', async () => {
      const res = await request(app)
        .post('/api/transactions/submit')
        .set('Idempotency-Key', 'fresh-key-001')
        .send({ signed_xdr: FAKE_XDR });

      expect(res.body.idempotent).toBeUndefined();
    });

    it('calls setCache with the correct key, response, and TTL of 86400', async () => {
      await request(app)
        .post('/api/transactions/submit')
        .set('Idempotency-Key', 'fresh-key-002')
        .send({ signed_xdr: FAKE_XDR });

      expect(mockSetCache).toHaveBeenCalledWith(
        'idempotency:fresh-key-002',
        { hash: 'fresh-hash-xyz', status: 'SUCCESS' },
        86400,
      );
    });

    it('checks the cache before processing', async () => {
      await request(app)
        .post('/api/transactions/submit')
        .set('Idempotency-Key', 'fresh-key-003')
        .send({ signed_xdr: FAKE_XDR });

      expect(mockGetCache).toHaveBeenCalledWith('idempotency:fresh-key-003');
    });
  });

  describe('missing Idempotency-Key header processes normally', () => {
    it('returns 200 with the transaction response', async () => {
      const res = await request(app)
        .post('/api/transactions/submit')
        .send({ signed_xdr: FAKE_XDR });

      expect(res.status).toBe(200);
      expect(res.body.hash).toBe('fresh-hash-xyz');
    });

    it('does not call getCache when no idempotency key is provided', async () => {
      await request(app)
        .post('/api/transactions/submit')
        .send({ signed_xdr: FAKE_XDR });

      expect(mockGetCache).not.toHaveBeenCalled();
    });

    it('does not call setCache when no idempotency key is provided', async () => {
      await request(app)
        .post('/api/transactions/submit')
        .send({ signed_xdr: FAKE_XDR });

      expect(mockSetCache).not.toHaveBeenCalled();
    });

    it('still calls verifyTransactionXdr without idempotency key', async () => {
      await request(app)
        .post('/api/transactions/submit')
        .send({ signed_xdr: FAKE_XDR });

      expect(mockVerifyTransactionXdr).toHaveBeenCalledWith(FAKE_XDR);
    });
  });
});
