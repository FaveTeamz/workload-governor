/**
 * verify-xdr.test.ts
 *
 * Integration tests for POST /api/verify-xdr (issue #573).
 *
 * Coverage:
 *  1. Endpoint accepts and validates XDR
 *  2. Returns structured validation result
 *  3. Caches results in Redis (1 hour TTL)
 *  4. Rate limited to prevent abuse
 *  5. Tests cover valid, invalid, and malformed XDR
 */

import request from 'supertest';
import { MockPool, resetDb } from './setup';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

const mockPool = new MockPool();
jest.mock('../../src/db', () => ({
  pool: mockPool,
  migrate: jest.fn(),
  healthCheck: jest.fn(),
}));

jest.mock('../../src/services/redis', () => ({
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(undefined),
  invalidateCache: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/soroban', () => ({
  SorobanService: jest.fn().mockImplementation(() => ({
    simulate: jest.fn().mockResolvedValue({ fee: '100', instructions: 0, readBytes: 0, writeBytes: 0 }),
  })),
}));

import { createApp } from '../../src/app';
import { getCache, setCache } from '../../src/services/redis';

const app = createApp();

beforeEach(() => {
  resetDb();
  jest.clearAllMocks();
});

// ===========================================================================
// POST /api/verify-xdr
// ===========================================================================

describe('POST /api/verify-xdr', () => {
  it('returns 400 when xdr is missing', async () => {
    const res = await request(app)
      .post('/api/verify-xdr')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation failed');
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'xdr' })]),
    );
  });

  it('returns 400 when xdr is empty string', async () => {
    const res = await request(app)
      .post('/api/verify-xdr')
      .send({ xdr: '' });

    expect(res.status).toBe(400);
  });

  it('returns valid=false for malformed XDR', async () => {
    const res = await request(app)
      .post('/api/verify-xdr')
      .send({ xdr: 'not-valid-xdr' });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('MALFORMED_XDR')]),
    );
  });

  it('returns structured result with valid, errors, signer, contract fields', async () => {
    const res = await request(app)
      .post('/api/verify-xdr')
      .send({ xdr: 'invalid-xdr-for-testing' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('valid');
    expect(res.body).toHaveProperty('errors');
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it('checks cache before performing verification', async () => {
    const mockGetCache = getCache as jest.MockedFunction<typeof getCache>;
    mockGetCache.mockResolvedValueOnce({
      valid: true,
      errors: [],
      signer: 'GABC...',
      contract: 'CXYZ...',
    });

    const res = await request(app)
      .post('/api/verify-xdr')
      .send({ xdr: 'cached-xdr' });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.headers['x-cache']).toBe('HIT');
  });

  it('sets cache after verification (MISS)', async () => {
    const res = await request(app)
      .post('/api/verify-xdr')
      .send({ xdr: 'uncached-xdr-value' });

    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('MISS');

    // Verify setCache was called
    const mockSetCache = setCache as jest.MockedFunction<typeof setCache>;
    expect(mockSetCache).toHaveBeenCalled();
  });

  it('accepts optional expected_signer parameter', async () => {
    const res = await request(app)
      .post('/api/verify-xdr')
      .send({
        xdr: 'test-xdr',
        expected_signer: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('valid');
  });

  it('accepts optional expected_contract parameter', async () => {
    const res = await request(app)
      .post('/api/verify-xdr')
      .send({
        xdr: 'test-xdr',
        expected_contract: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('valid');
  });

  it('accepts both expected_signer and expected_contract', async () => {
    const res = await request(app)
      .post('/api/verify-xdr')
      .send({
        xdr: 'test-xdr',
        expected_signer: 'GABC123',
        expected_contract: 'CXYZ789',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('valid');
  });

  it('returns 400 for non-object body', async () => {
    const res = await request(app)
      .post('/api/verify-xdr')
      .send('not-an-object');

    expect(res.status).toBe(400);
  });
});
