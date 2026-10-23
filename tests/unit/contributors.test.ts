/**
 * contributors.test.ts  (tests/unit)
 *
 * Unit tests for the GET /api/contributors/:address/global-count endpoint.
 *
 * Coverage:
 *  (a) Returns cached value (cached: true) when Redis cache is warm
 *  (b) Calls through to SorobanService on cache miss, stores result, returns cached: false
 *  (c) Returns 400 for an invalid Stellar address
 */

import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';

// ---------------------------------------------------------------------------
// Mock database (required by app bootstrap)
// ---------------------------------------------------------------------------

jest.mock('../../src/db', () => ({
  pool: { query: jest.fn(), on: jest.fn() },
  migrate: jest.fn(),
  healthCheck: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock Redis service — we control what getCache/setCache return per test
// ---------------------------------------------------------------------------

const mockGetCache = jest.fn();
const mockSetCache = jest.fn();
const mockInvalidateCache = jest.fn();
const mockGetMetrics = jest.fn().mockReturnValue({ hits: 0, misses: 0 });

jest.mock('../../src/services/redis', () => ({
  __esModule: true,
  default: { on: jest.fn() },
  getCache: (...args: unknown[]) => mockGetCache(...args),
  setCache: (...args: unknown[]) => mockSetCache(...args),
  invalidateCache: (...args: unknown[]) => mockInvalidateCache(...args),
  getMetrics: () => mockGetMetrics(),
}));

// ---------------------------------------------------------------------------
// Mock SorobanService — controls what getGlobalApplicationCount returns
// ---------------------------------------------------------------------------

const mockGetGlobalApplicationCount = jest.fn();

jest.mock('../../src/soroban', () => ({
  SorobanService: jest.fn().mockImplementation(() => ({
    getGlobalApplicationCount: (...args: unknown[]) =>
      mockGetGlobalApplicationCount(...args),
  })),
}));

// Import app *after* all mocks are in place
import { createApp } from '../../src/app';

const app = createApp();

// ---------------------------------------------------------------------------
// Test addresses
// ---------------------------------------------------------------------------

const VALID_ADDR = Keypair.random().publicKey();
const INVALID_ADDR = 'not-a-stellar-address';

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  // Default: setCache resolves immediately
  mockSetCache.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// (a) Cache warm — returns stored value without calling Soroban
// ---------------------------------------------------------------------------

describe('GET /api/contributors/:address/global-count — cache warm', () => {
  it('returns 200 with cached: true and the value from Redis', async () => {
    // Simulate a warm cache hit returning count 7
    mockGetCache.mockResolvedValue(7);

    const res = await request(app).get(
      `/api/contributors/${VALID_ADDR}/global-count`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      address: VALID_ADDR,
      global_count: 7,
      cached: true,
    });

    // Redis was consulted
    expect(mockGetCache).toHaveBeenCalledWith(`global-count:${VALID_ADDR}`);
    // Soroban was NOT called
    expect(mockGetGlobalApplicationCount).not.toHaveBeenCalled();
    // setCache was NOT called (value already in cache)
    expect(mockSetCache).not.toHaveBeenCalled();
  });

  it('returns cached: true even when the cached count is 0', async () => {
    mockGetCache.mockResolvedValue(0);

    const res = await request(app).get(
      `/api/contributors/${VALID_ADDR}/global-count`,
    );

    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(true);
    expect(res.body.global_count).toBe(0);
    expect(mockGetGlobalApplicationCount).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (b) Cache miss — calls Soroban, stores result, returns cached: false
// ---------------------------------------------------------------------------

describe('GET /api/contributors/:address/global-count — cache miss', () => {
  it('calls SorobanService on miss and returns cached: false', async () => {
    // Simulate cache miss
    mockGetCache.mockResolvedValue(null);
    // Soroban returns count 3
    mockGetGlobalApplicationCount.mockResolvedValue(3);

    const res = await request(app).get(
      `/api/contributors/${VALID_ADDR}/global-count`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      address: VALID_ADDR,
      global_count: 3,
      cached: false,
    });

    // Soroban was called with the contributor address
    expect(mockGetGlobalApplicationCount).toHaveBeenCalledWith(VALID_ADDR);
    // Result was stored in cache
    expect(mockSetCache).toHaveBeenCalledWith(
      `global-count:${VALID_ADDR}`,
      3,
      expect.any(Number),
    );
  });

  it('uses default TTL of 30 when GLOBAL_COUNT_TTL is not set', async () => {
    delete process.env.GLOBAL_COUNT_TTL;
    mockGetCache.mockResolvedValue(null);
    mockGetGlobalApplicationCount.mockResolvedValue(5);

    await request(app).get(`/api/contributors/${VALID_ADDR}/global-count`);

    expect(mockSetCache).toHaveBeenCalledWith(
      `global-count:${VALID_ADDR}`,
      5,
      30,
    );
  });

  it('respects GLOBAL_COUNT_TTL env var when set', async () => {
    process.env.GLOBAL_COUNT_TTL = '60';
    mockGetCache.mockResolvedValue(null);
    mockGetGlobalApplicationCount.mockResolvedValue(2);

    await request(app).get(`/api/contributors/${VALID_ADDR}/global-count`);

    expect(mockSetCache).toHaveBeenCalledWith(
      `global-count:${VALID_ADDR}`,
      2,
      60,
    );

    delete process.env.GLOBAL_COUNT_TTL;
  });

  it('falls back to a stub count when Soroban throws', async () => {
    mockGetCache.mockResolvedValue(null);
    mockGetGlobalApplicationCount.mockRejectedValue(new Error('RPC timeout'));

    const res = await request(app).get(
      `/api/contributors/${VALID_ADDR}/global-count`,
    );

    expect(res.status).toBe(200);
    // The stub returns a value in [0, 15]
    expect(res.body.global_count).toBeGreaterThanOrEqual(0);
    expect(res.body.global_count).toBeLessThanOrEqual(15);
    expect(res.body.cached).toBe(false);
    // setCache was still called with the stub value
    expect(mockSetCache).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (c) Invalid Stellar address → 400
// ---------------------------------------------------------------------------

describe('GET /api/contributors/:address/global-count — invalid address', () => {
  it('returns 400 for a non-Stellar address', async () => {
    const res = await request(app).get(
      `/api/contributors/${INVALID_ADDR}/global-count`,
    );

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/invalid stellar address/i);
  });

  it('does not touch Redis or Soroban on invalid address', async () => {
    await request(app).get(`/api/contributors/${INVALID_ADDR}/global-count`);

    expect(mockGetCache).not.toHaveBeenCalled();
    expect(mockGetGlobalApplicationCount).not.toHaveBeenCalled();
    expect(mockSetCache).not.toHaveBeenCalled();
  });

  it('returns 400 for an empty string address', async () => {
    // Express will not match this route at all (empty param), but test a known-short invalid
    const res = await request(app).get(
      `/api/contributors/GBADADDRESS/global-count`,
    );
    expect(res.status).toBe(400);
  });
});
