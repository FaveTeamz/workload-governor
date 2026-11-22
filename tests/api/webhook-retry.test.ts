/**
 * webhook-retry.test.ts
 *
 * Tests for exponential backoff with full jitter and Redis dead-letter queue
 * in the webhook dispatcher (issue #843).
 *
 * Coverage:
 *  1. Failed webhooks retried up to MAX_ATTEMPTS (5) times
 *  2. Exponential backoff with full jitter — delay ≤ min(60_000, 1000 * 2^attempt)
 *  3. DLQ entry pushed to Redis `dlq:webhooks` after 5 failures
 *  4. DLQ entry written to webhook_dead_letters DB table after 5 failures
 *  5. GET /api/admin/webhooks/dlq returns entries from Redis
 *  6. dispatchAssignmentEvent fires to all registered webhooks
 */

import request from 'supertest';
import { MockPool, resetDb, tbl } from './setup';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

const mockPool = new MockPool();
jest.mock('../../src/db', () => ({
  pool: mockPool,
  migrate: jest.fn(),
  healthCheck: jest.fn(),
}));

// Mock Redis default export (ioredis client) and named cache helpers
const mockRedisMethods = {
  lpush: jest.fn().mockResolvedValue(1),
  lrange: jest.fn().mockResolvedValue([]),
  lindex: jest.fn().mockResolvedValue(null),
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
  keys: jest.fn().mockResolvedValue([]),
  del: jest.fn().mockResolvedValue(0),
  quit: jest.fn().mockResolvedValue('OK'),
  on: jest.fn(),
};

jest.mock('../../src/services/redis', () => ({
  __esModule: true,
  default: mockRedisMethods,
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(undefined),
  invalidateCache: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/soroban', () => ({
  SorobanService: jest.fn().mockImplementation(() => ({
    simulate: jest.fn().mockResolvedValue({ fee: '100', instructions: 0, readBytes: 0, writeBytes: 0 }),
  })),
}));

jest.mock('../../src/github', () => ({
  GitHubService: jest.fn().mockImplementation(() => ({
    validateOrg: jest.fn().mockResolvedValue(true),
  })),
}));

jest.mock('../../src/signature', () => ({
  verifySignature: jest.fn().mockReturnValue(true),
  parseAuthHeader: jest.fn().mockReturnValue({
    adminAddress: 'GADMIN',
    message: 'test',
    signature: 'sig',
  }),
}));

import { createApp } from '../../src/app';
import {
  dispatchToWebhook,
  dispatchAssignmentEvent,
  WebhookPayload,
  MAX_ATTEMPTS,
  DLQ_KEY,
  computeBackoffDelay,
} from '../../src/services/webhook-dispatcher';

const app = createApp();

beforeEach(() => {
  resetDb();
  jest.clearAllMocks();
  // Reset default mock behaviours after clearAllMocks
  mockRedisMethods.lpush.mockResolvedValue(1);
  mockRedisMethods.lrange.mockResolvedValue([]);
  mockRedisMethods.lindex.mockResolvedValue(null);
});

// ===========================================================================
// computeBackoffDelay — unit tests for the jitter formula
// ===========================================================================

describe('computeBackoffDelay', () => {
  it('returns a value between 0 and min(MAX_DELAY, BASE_DELAY * 2^attempt)', () => {
    // Run many samples to verify the range
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const BASE_DELAY = 1_000;
      const MAX_DELAY = 60_000;
      const cap = Math.min(MAX_DELAY, BASE_DELAY * Math.pow(2, attempt));
      for (let i = 0; i < 20; i++) {
        const delay = computeBackoffDelay(attempt);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(cap);
      }
    }
  });

  it('never exceeds MAX_DELAY (60_000 ms) regardless of attempt number', () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const delay = computeBackoffDelay(attempt);
      expect(delay).toBeLessThanOrEqual(60_000);
    }
  });

  it('uses Math.random — produces different values across calls', () => {
    const delays = new Set<number>();
    for (let i = 0; i < 50; i++) {
      delays.add(computeBackoffDelay(3));
    }
    // With real Math.random, the probability of all 50 values being identical is ~0
    expect(delays.size).toBeGreaterThan(1);
  });
});

// ===========================================================================
// dispatchToWebhook — retry behavior
// ===========================================================================

describe('dispatchToWebhook retry behavior', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  /** Skip actual sleep delays in tests. */
  function skipSleep() {
    jest.spyOn(global, 'setTimeout').mockImplementation((fn: Function) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    });
  }

  it(`retries exactly MAX_ATTEMPTS (${MAX_ATTEMPTS}) times on persistent failure`, async () => {
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(new Response('error', { status: 500, statusText: 'Internal Server Error' }));
    }) as unknown as typeof fetch;

    skipSleep();

    const payload: WebhookPayload = {
      event: 'assignment.created',
      org_id: 'test-org',
      issue_id: 1,
      contributor: 'GABC',
      ledger: 100,
      timestamp: new Date().toISOString(),
    };

    await dispatchToWebhook(1, 'https://test.example.com/hook', 'secret', payload);

    expect(callCount).toBe(MAX_ATTEMPTS);
  });

  it('stops retrying after first successful response', async () => {
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(new Response('error', { status: 503, statusText: 'Service Unavailable' }));
      }
      return Promise.resolve(new Response('ok', { status: 200 }));
    }) as unknown as typeof fetch;

    skipSleep();

    const payload: WebhookPayload = {
      event: 'assignment.completed',
      org_id: 'test-org',
      issue_id: 2,
      contributor: 'GXYZ',
      ledger: 200,
      timestamp: new Date().toISOString(),
    };

    await dispatchToWebhook(2, 'https://test.example.com/hook', 'secret', payload);

    expect(callCount).toBe(2);
    // No DLQ entry — succeeded on second attempt
    expect(mockRedisMethods.lpush).not.toHaveBeenCalled();
    expect(tbl('webhook_dead_letters')).toHaveLength(0);
  });

  it('pushes entry to Redis DLQ (dlq:webhooks) after all retries fail', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused')) as unknown as typeof fetch;

    skipSleep();

    const payload: WebhookPayload = {
      event: 'assignment.revoked',
      org_id: 'test-org',
      issue_id: 3,
      contributor: 'GDEF',
      ledger: 300,
      timestamp: new Date().toISOString(),
    };

    await dispatchToWebhook(3, 'https://test.example.com/hook', 'secret', payload);

    expect(mockRedisMethods.lpush).toHaveBeenCalledTimes(1);
    expect(mockRedisMethods.lpush).toHaveBeenCalledWith(
      DLQ_KEY,
      expect.stringContaining('"webhook_id":3'),
    );

    // Verify DLQ entry shape
    const dlqRaw = mockRedisMethods.lpush.mock.calls[0][1] as string;
    const dlqEntry = JSON.parse(dlqRaw);
    expect(dlqEntry.webhook_id).toBe(3);
    expect(dlqEntry.attempts).toBe(MAX_ATTEMPTS);
    expect(dlqEntry.last_error).toMatch(/Connection refused/i);
    expect(dlqEntry.failed_at).toBeTruthy();
  });

  it('writes to webhook_dead_letters DB table after all retries fail', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    skipSleep();

    const payload: WebhookPayload = {
      event: 'assignment.created',
      org_id: 'test-org',
      issue_id: 4,
      contributor: 'GFOO',
      ledger: 400,
      timestamp: new Date().toISOString(),
    };

    await dispatchToWebhook(4, 'https://test.example.com/hook', 'secret', payload);

    const deadLetters = tbl('webhook_dead_letters');
    expect(deadLetters.length).toBeGreaterThan(0);
    expect(deadLetters[0].attempts).toBe(MAX_ATTEMPTS);
    expect(String(deadLetters[0].last_error)).toMatch(/ECONNREFUSED/i);
  });

  it('does NOT push to DLQ on eventual success (retry 3 of 5 succeeds)', async () => {
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.resolve(new Response('retry', { status: 503, statusText: 'Service Unavailable' }));
      }
      return Promise.resolve(new Response('ok', { status: 200 }));
    }) as unknown as typeof fetch;

    skipSleep();

    const payload: WebhookPayload = {
      event: 'assignment.completed',
      org_id: 'test-org',
      issue_id: 5,
      contributor: 'GBAR',
      ledger: 500,
      timestamp: new Date().toISOString(),
    };

    await dispatchToWebhook(5, 'https://test.example.com/hook', 'secret', payload);

    expect(callCount).toBe(3);
    expect(mockRedisMethods.lpush).not.toHaveBeenCalled();
    expect(tbl('webhook_dead_letters')).toHaveLength(0);
  });

  it('uses jitter — sleep is called with a value between 0 and the cap', async () => {
    const sleepCalls: number[] = [];

    // Intercept setTimeout to record delay values without actually waiting
    jest.spyOn(global, 'setTimeout').mockImplementation((fn: Function, ms?: number) => {
      sleepCalls.push(ms ?? 0);
      fn();
      return 0 as unknown as NodeJS.Timeout;
    });

    global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as unknown as typeof fetch;

    const payload: WebhookPayload = {
      event: 'assignment.created',
      org_id: 'test-org',
      issue_id: 6,
      contributor: 'GJITTER',
      ledger: 600,
      timestamp: new Date().toISOString(),
    };

    await dispatchToWebhook(6, 'https://test.example.com/hook', 'secret', payload);

    // Should have (MAX_ATTEMPTS - 1) = 4 sleep calls
    expect(sleepCalls).toHaveLength(MAX_ATTEMPTS - 1);

    // Each delay must be within the jitter cap for its attempt
    sleepCalls.forEach((ms, i) => {
      const cap = Math.min(60_000, 1_000 * Math.pow(2, i));
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThanOrEqual(cap + 1); // +1 for float rounding tolerance
    });
  });
});

// ===========================================================================
// dispatchAssignmentEvent — dispatches to registered webhooks
// ===========================================================================

describe('dispatchAssignmentEvent', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('fires to all registered webhooks concurrently', async () => {
    await mockPool.query(
      `INSERT INTO org_webhooks (org_id, url, secret) VALUES ($1, $2, $3)`,
      ['test-org', 'https://test.example.com/hook', 'secret'],
    );

    const fetchCalls: { url: string; options: RequestInit }[] = [];
    global.fetch = jest.fn().mockImplementation((url: string, options: RequestInit) => {
      fetchCalls.push({ url, options });
      return Promise.resolve(new Response('ok', { status: 200 }));
    }) as unknown as typeof fetch;

    await dispatchAssignmentEvent('assignment.created', 'test-org', 1, 'GABC', 1234567);

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('https://test.example.com/hook');
  });

  it('fires to multiple webhooks for the same org', async () => {
    await mockPool.query(
      `INSERT INTO org_webhooks (org_id, url, secret) VALUES ($1, $2, $3)`,
      ['multi-org', 'https://hook1.example.com/wh', 'secret1'],
    );
    await mockPool.query(
      `INSERT INTO org_webhooks (org_id, url, secret) VALUES ($1, $2, $3)`,
      ['multi-org', 'https://hook2.example.com/wh', 'secret2'],
    );

    const fetchedUrls: string[] = [];
    global.fetch = jest.fn().mockImplementation((url: string) => {
      fetchedUrls.push(url);
      return Promise.resolve(new Response('ok', { status: 200 }));
    }) as unknown as typeof fetch;

    await dispatchAssignmentEvent('assignment.revoked', 'multi-org', 99, 'GMULTI', 999);

    expect(fetchedUrls).toHaveLength(2);
    expect(fetchedUrls).toContain('https://hook1.example.com/wh');
    expect(fetchedUrls).toContain('https://hook2.example.com/wh');
  });
});

// ===========================================================================
// GET /api/admin/webhooks/dlq — DLQ inspect endpoint
// ===========================================================================

describe('GET /api/admin/webhooks/dlq', () => {
  it('returns empty entries when DLQ is empty', async () => {
    mockRedisMethods.lrange.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/admin/webhooks/dlq')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('queue', DLQ_KEY);
    expect(res.body).toHaveProperty('total', 0);
    expect(Array.isArray(res.body.entries)).toBe(true);
    expect(res.body.entries).toHaveLength(0);
  });

  it('returns DLQ entries from Redis', async () => {
    const entry = {
      webhook_id: 7,
      url: 'https://test.example.com/hook',
      payload: { event: 'assignment.created', org_id: 'test', issue_id: 7, contributor: 'G', ledger: 1, timestamp: '' },
      last_error: 'HTTP 503 Service Unavailable',
      attempts: 5,
      failed_at: new Date().toISOString(),
    };

    mockRedisMethods.lrange.mockResolvedValueOnce([JSON.stringify(entry)]);

    const res = await request(app)
      .get('/api/admin/webhooks/dlq')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.entries[0].webhook_id).toBe(7);
    expect(res.body.entries[0].attempts).toBe(5);
    expect(res.body.entries[0].last_error).toBe('HTTP 503 Service Unavailable');
  });

  it('calls Redis lrange with the correct DLQ key', async () => {
    await request(app)
      .get('/api/admin/webhooks/dlq')
      .set('Authorization', 'Bearer test-token');

    expect(mockRedisMethods.lrange).toHaveBeenCalledWith(DLQ_KEY, 0, 99);
  });
});

// ===========================================================================
// GET /webhooks/org/:webhookId/deliveries — delivery history (pre-existing)
// ===========================================================================

describe('GET /webhooks/org/:webhookId/deliveries', () => {
  it('returns 400 for non-numeric webhook id', async () => {
    const res = await request(app).get('/webhooks/org/abc/deliveries');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('returns 200 with empty deliveries for valid webhook id', async () => {
    const res = await request(app).get('/webhooks/org/1/deliveries');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('webhook_id', 1);
    expect(Array.isArray(res.body.deliveries)).toBe(true);
  });
});
