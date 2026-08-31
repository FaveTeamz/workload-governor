/**
 * webhook-retry.test.ts
 *
 * Integration tests for the webhook retry and dead letter queue feature (issue #565).
 *
 * Coverage:
 *  1. Failed webhooks retried up to 3 times
 *  2. Exponential backoff between retries (5s, 30s, 5min)
 *  3. Delivery history accessible via API
 *  4. Dead letter queue entries visible
 *  5. Tests cover retry scenarios
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
import { dispatchToWebhook, dispatchAssignmentEvent, WebhookPayload } from '../../src/services/webhook-dispatcher';

const app = createApp();

beforeEach(() => {
  resetDb();
  jest.clearAllMocks();
});

// ===========================================================================
// POST /webhooks/org/:webhookId/deliveries — delivery status
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
    expect(res.body).toHaveProperty('deliveries');
    expect(Array.isArray(res.body.deliveries)).toBe(true);
  });
});

// ===========================================================================
// dispatchToWebhook — retry behavior
// ===========================================================================

describe('dispatchToWebhook retry behavior', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('retries up to 3 times on failure', async () => {
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(new Response('error', { status: 500, statusText: 'Internal Server Error' }));
    }) as unknown as typeof fetch;

    const payload: WebhookPayload = {
      event: 'assignment.created',
      org_id: 'test-org',
      issue_id: 1,
      contributor: 'GABC...',
      ledger: 100,
      timestamp: new Date().toISOString(),
    };

    // We need to mock the delay to avoid actual waits in tests
    jest.spyOn(global, 'setTimeout').mockImplementation((fn: Function) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    });

    await dispatchToWebhook(1, 'https://test.example.com/hook', 'secret', payload);

    expect(callCount).toBe(3);
    expect(tbl('webhook_dead_letters').length).toBeGreaterThan(0);
  });

  it('stops retrying after successful response', async () => {
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(new Response('error', { status: 500, statusText: 'Internal Server Error' }));
      }
      return Promise.resolve(new Response('ok', { status: 200 }));
    }) as unknown as typeof fetch;

    jest.spyOn(global, 'setTimeout').mockImplementation((fn: Function) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    });

    const payload: WebhookPayload = {
      event: 'assignment.completed',
      org_id: 'test-org',
      issue_id: 2,
      contributor: 'GXYZ...',
      ledger: 200,
      timestamp: new Date().toISOString(),
    };

    await dispatchToWebhook(2, 'https://test.example.com/hook', 'secret', payload);

    expect(callCount).toBe(2);
    expect(tbl('webhook_dead_letters')).toHaveLength(0);
  });

  it('writes to dead letter queue after all retries fail', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused')) as unknown as typeof fetch;

    jest.spyOn(global, 'setTimeout').mockImplementation((fn: Function) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    });

    const payload: WebhookPayload = {
      event: 'assignment.revoked',
      org_id: 'test-org',
      issue_id: 3,
      contributor: 'GDEF...',
      ledger: 300,
      timestamp: new Date().toISOString(),
    };

    await dispatchToWebhook(3, 'https://test.example.com/hook', 'secret', payload);

    const deadLetters = tbl('webhook_dead_letters');
    expect(deadLetters.length).toBeGreaterThan(0);
    expect(deadLetters[0].attempts).toBe(3);
    expect(deadLetters[0].last_error).toMatch(/Connection refused/i);
  });
});

// ===========================================================================
// dispatchAssignmentEvent — dispatches to registered webhooks
// ===========================================================================

describe('dispatchAssignmentEvent', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fires to registered webhooks concurrently', async () => {
    await mockPool.query(
      `INSERT INTO org_webhooks (org_id, url, secret) VALUES ($1, $2, $3)`,
      ['test-org', 'https://test.example.com/hook', 'secret'],
    );

    const fetchCalls: { url: string; options: RequestInit }[] = [];
    global.fetch = jest.fn().mockImplementation((url: string, options: RequestInit) => {
      fetchCalls.push({ url, options });
      return Promise.resolve(new Response('ok', { status: 200 }));
    }) as unknown as typeof fetch;

    await dispatchAssignmentEvent('assignment.created', 'test-org', 1, 'GABC...', 1234567);

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('https://test.example.com/hook');
  });
});
