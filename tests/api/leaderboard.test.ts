import request from 'supertest';
import { MockPool, resetDb } from './setup';

const mockPool = new MockPool();
jest.mock('../../src/db', () => ({
  pool: mockPool,
  migrate: jest.fn(),
  healthCheck: jest.fn(),
}));

// Mock Redis cache — default to no cached value
const mockGetCache = jest.fn().mockResolvedValue(null);
const mockSetCache = jest.fn().mockResolvedValue(undefined);
jest.mock('../../src/services/redis', () => ({
  getCache: (...args: unknown[]) => mockGetCache(...args),
  setCache: (...args: unknown[]) => mockSetCache(...args),
}));

import { createApp } from '../../src/app';

const app = createApp();

beforeEach(() => {
  resetDb();
  mockGetCache.mockResolvedValue(null);
  mockSetCache.mockResolvedValue(undefined);
});

describe('GET /api/leaderboard', () => {
  it('returns 200 with correct response shape on empty DB', async () => {
    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('limit', 20);
    expect(res.body).toHaveProperty('total_pages');
    expect(res.body).toHaveProperty('period', '30d');
    expect(res.body).toHaveProperty('sort_by', 'fairness_score');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns 400 for invalid period', async () => {
    const res = await request(app).get('/api/leaderboard?period=invalid');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid period/i);
  });

  it('returns 400 for invalid sort_by', async () => {
    const res = await request(app).get('/api/leaderboard?sort_by=bogus');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid sort_by/i);
  });

  it('accepts valid period values', async () => {
    for (const period of ['7d', '30d', '90d', 'all']) {
      const res = await request(app).get(`/api/leaderboard?period=${period}`);
      expect(res.status).toBe(200);
    }
  });

  it('accepts valid sort_by values', async () => {
    for (const sort_by of ['fairness_score', 'completions', 'applications']) {
      const res = await request(app).get(`/api/leaderboard?sort_by=${sort_by}`);
      expect(res.status).toBe(200);
    }
  });

  it('returns cached response when cache hit', async () => {
    const cachedPayload = {
      data: [
        {
          rank: 1,
          contributor: 'GBXXX1ABCDEFGHIJKLMNO12345',
          contributor_short: 'GBXXX1…2345',
          applications: 5,
          completions: 3,
          active_assignments: 1,
          fairness_score: 0.5,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      total_pages: 1,
      period: '30d',
      org_id: null,
      sort_by: 'fairness_score',
    };
    mockGetCache.mockResolvedValueOnce(cachedPayload);

    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body.data[0].contributor).toBe('GBXXX1ABCDEFGHIJKLMNO12345');
    // Pool should not have been called because cache hit
    expect(mockGetCache).toHaveBeenCalledWith(
      expect.stringContaining('leaderboard:'),
    );
  });

  it('respects page and limit query params', async () => {
    const res = await request(app).get('/api/leaderboard?page=2&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(5);
  });

  it('clamps limit to max 100', async () => {
    const res = await request(app).get('/api/leaderboard?limit=999');
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(100);
  });

  it('filters by org_id query param', async () => {
    const res = await request(app).get('/api/leaderboard?org_id=stellar-org');
    expect(res.status).toBe(200);
    expect(res.body.org_id).toBe('stellar-org');
  });

  it('stores result in cache after DB query', async () => {
    await request(app).get('/api/leaderboard');
    expect(mockSetCache).toHaveBeenCalledWith(
      expect.stringContaining('leaderboard:'),
      expect.any(Object),
      300, // 5-minute TTL
    );
  });
});
