/**
 * org-webhooks.test.ts
 *
 * Integration tests for the org webhook registration/dispatch endpoints
 * (issue #196).
 *
 * Coverage:
 *  1. POST /webhooks/org registers a webhook → 201 with correct shape
 *  2. DELETE /webhooks/org/:id removes it → 204
 *  3. DELETE /webhooks/org/:id with non-existent id → 404
 *  4. POST /webhooks/org with missing org_id → 400
 *  5. POST /webhooks/org with non-HTTPS url → 400
 *  6. signPayload produces a deterministic HMAC-SHA256 value
 *  7. dispatchAssignmentEvent fires to registered webhooks (fetch mocked)
 *  8. Failed delivery writes to dead_letters table after MAX_ATTEMPTS
 */

import request from 'supertest';
import crypto from 'crypto';
import { MockPool, resetDb, tbl } from './setup';

// ---------------------------------------------------------------------------
// Mock dependencies before any module imports
// ---------------------------------------------------------------------------

const mockPool = new MockPool();
jest.mock('../../src/db', () => ({
  pool: mockPool,
  migrate: jest.fn(),
  healthCheck: jest.fn(),
}));

jest.mock('../../src/services/redis', () => ({
  invalidateCache: jest.fn().mockResolvedValue(undefined),
  getCached: jest.fn().mockResolvedValue(null),
  setCached: jest.fn().mockResolvedValue(undefined),
}));

// Mock SorobanService so no real RPC calls happen and no stellar-sdk version
// mismatch issues surface in this webhook-focused test suite.
jest.mock('../../src/soroban', () => ({
  SorobanService: jest.fn().mockImplementation(() => ({
    getGlobalApplicationCount: jest.fn().mockResolvedValue(0),
    getOrgAssignmentCount: jest.fn().mockResolvedValue(0),
  })),
}));

import { createApp } from '../../src/app';
import { signPayload, dispatchAssignmentEvent, dispatchToWebhook, WebhookPayload } from '../../src/services/webhook-dispatcher';

process.env.GITHUB_WEBHOOK_SECRET = 'test-secret';

const app = createApp();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_ORG = 'test-org';
const VALID_URL = 'https://example.com/hook';
const VALID_SECRET = 'super-secret-value';

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDb();
});

// ===========================================================================
// POST /webhooks/org — register
// ===========================================================================

describe('POST /webhooks/org', () => {
  it('TC-1: returns 201 with correct shape for valid payload', async () => {
    const res = await request(app)
      .post('/webhooks/org')
      .send({ org_id: VALID_ORG, url: VALID_URL, secret: VALID_SECRET });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(typeof res.body.id).toBe('number');
    expect(res.body.org_id).toBe(VALID_ORG);
    expect(res.body.url).toBe(VALID_URL);
    expect(res.body).toHaveProperty('created_at');
  });

  it('TC-4: returns 400 when org_id is missing', async () => {
    const res = await request(app)
      .post('/webhooks/org')
      .send({ url: VALID_URL, secret: VALID_SECRET });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/org_id/i);
  });

  it('TC-4b: returns 400 when org_id is an empty string', async () => {
    const res = await request(app)
      .post('/webhooks/org')
      .send({ org_id: '   ', url: VALID_URL, secret: VALID_SECRET });

    expect(res.status).toBe(400);
  });

  it('TC-5: returns 400 when url does not start with https://', async () => {
    const res = await request(app)
      .post('/webhooks/org')
      .send({ org_id: VALID_ORG, url: 'http://insecure.example.com/hook', secret: VALID_SECRET });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/https/i);
  });

  it('returns 400 when secret is missing', async () => {
    const res = await request(app)
      .post('/webhooks/org')
      .send({ org_id: VALID_ORG, url: VALID_URL });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/secret/i);
  });

  it('returns 400 when url is missing', async () => {
    const res = await request(app)
      .post('/webhooks/org')
      .send({ org_id: VALID_ORG, secret: VALID_SECRET });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/url/i);
  });
});

// ===========================================================================
// DELETE /webhooks/org/:id — remove
// ===========================================================================

describe('DELETE /webhooks/org/:id', () => {
  it('TC-2: returns 204 when webhook exists', async () => {
    // First create one
    const createRes = await request(app)
      .post('/webhooks/org')
      .send({ org_id: VALID_ORG, url: VALID_URL, secret: VALID_SECRET });

    expect(createRes.status).toBe(201);
    const { id } = createRes.body as { id: number };

    const deleteRes = await request(app).delete(`/webhooks/org/${id}`);
    expect(deleteRes.status).toBe(204);

    // Confirm removal from DB
    const remaining = tbl('org_webhooks').filter((r) => r.id === id);
    expect(remaining).toHaveLength(0);
  });

  it('TC-3: returns 404 for a non-existent webhook id', async () => {
    const res = await request(app).delete('/webhooks/org/99999');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 400 for an invalid (non-numeric) id', async () => {
    const res = await request(app).delete('/webhooks/org/not-a-number');
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// signPayload — HMAC-SHA256 correctness
// ===========================================================================

describe('signPayload', () => {
  it('TC-6: produces the expected sha256=<hex> format', () => {
    const payload = JSON.stringify({ event: 'assignment.created', org_id: 'foo' });
    const secret = 'test-secret';

    const result = signPayload(payload, secret);

    // Verify format
    expect(result).toMatch(/^sha256=[a-f0-9]{64}$/);

    // Verify value matches a manual HMAC computation
    const expected = `sha256=${crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')}`;

    expect(result).toBe(expected);
  });

  it('produces different signatures for different secrets', () => {
    const payload = '{"event":"test"}';
    const sig1 = signPayload(payload, 'secret-a');
    const sig2 = signPayload(payload, 'secret-b');
    expect(sig1).not.toBe(sig2);
  });

  it('produces different signatures for different payloads', () => {
    const secret = 'shared-secret';
    const sig1 = signPayload('{"event":"a"}', secret);
    const sig2 = signPayload('{"event":"b"}', secret);
    expect(sig1).not.toBe(sig2);
  });
});

// ===========================================================================
// dispatchAssignmentEvent — dispatches to registered webhooks
// ===========================================================================

describe('dispatchAssignmentEvent', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    // Restore fetch mock
    global.fetch = originalFetch;
  });

  it('TC-7: calls fetch for each registered webhook with correct headers', async () => {
    // Seed a webhook registration
    await mockPool.query(
      `INSERT INTO org_webhooks (org_id, url, secret) VALUES ($1, $2, $3)`,
      [VALID_ORG, VALID_URL, VALID_SECRET],
    );

    const fetchCalls: { url: string; options: RequestInit }[] = [];
    global.fetch = jest.fn().mockImplementation((url: string, options: RequestInit) => {
      fetchCalls.push({ url, options });
      return Promise.resolve(new Response('ok', { status: 200 }));
    }) as unknown as typeof fetch;

    await dispatchAssignmentEvent('assignment.completed', VALID_ORG, 42, 'GABC...', 1234567);

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe(VALID_URL);

    const headers = fetchCalls[0].options.headers as Record<string, string>;
    expect(headers['X-WG-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(headers['X-WG-Event']).toBe('assignment.completed');
    expect(headers['Content-Type']).toBe('application/json');

    // Verify payload shape
    const body = JSON.parse(fetchCalls[0].options.body as string) as WebhookPayload;
    expect(body.event).toBe('assignment.completed');
    expect(body.org_id).toBe(VALID_ORG);
    expect(body.issue_id).toBe(42);
    expect(body.contributor).toBe('GABC...');
    expect(body.ledger).toBe(1234567);
    expect(typeof body.timestamp).toBe('string');
  });

  it('does nothing when no webhooks are registered for org', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await dispatchAssignmentEvent('assignment.created', 'unknown-org', 1, 'GABC', 0);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// dispatchToWebhook — dead-letter on failure
// ===========================================================================

describe('dispatchToWebhook', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('TC-8: writes to webhook_dead_letters after all retries fail', async () => {
    // Mock fetch to always fail
    global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused')) as unknown as typeof fetch;

    const payload: WebhookPayload = {
      event: 'assignment.revoked',
      org_id: 'org-x',
      issue_id: 7,
      contributor: 'GXXX',
      ledger: 9,
      timestamp: new Date().toISOString(),
    };

    await dispatchToWebhook(1, 'https://bad-endpoint.example.com/hook', 'secret', payload);

    const deadLetters = tbl('webhook_dead_letters');
    expect(deadLetters.length).toBeGreaterThan(0);
    const letter = deadLetters[0];
    expect(letter.webhook_id).toBe(1);
    expect(letter.attempts).toBe(3);
    expect(typeof letter.last_error).toBe('string');
    expect(letter.last_error).toMatch(/Connection refused/i);
  });

  it('does not write to dead_letters when delivery succeeds', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('ok', { status: 200 })) as unknown as typeof fetch;

    const payload: WebhookPayload = {
      event: 'assignment.created',
      org_id: 'org-y',
      issue_id: 1,
      contributor: 'GYYY',
      ledger: 100,
      timestamp: new Date().toISOString(),
    };

    await dispatchToWebhook(2, 'https://good-endpoint.example.com/hook', 'secret', payload);

    expect(tbl('webhook_dead_letters')).toHaveLength(0);
  });
});
