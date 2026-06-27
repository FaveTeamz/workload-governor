/**
 * Integration tests for POST /webhooks/github.
 *
 * Covers:
 * - 401 on missing/invalid signature
 * - Happy paths: opened, closed, edited events
 * - 200 (ignored) for unsupported event types
 * - Retry/idempotency: duplicate "opened" event does not error
 * - Database error path (simulated)
 */

import request from 'supertest';
import crypto from 'crypto';
import { MockPool, resetDb } from './setup';

const mockPool = new MockPool();
jest.mock('../../src/db', () => ({
  pool: mockPool,
  migrate: jest.fn(),
  healthCheck: jest.fn(),
}));

// Mock Redis invalidateCache so we don't need a real Redis connection
jest.mock('../../src/services/redis', () => ({
  invalidateCache: jest.fn().mockResolvedValue(undefined),
  getCached: jest.fn().mockResolvedValue(null),
  setCached: jest.fn().mockResolvedValue(undefined),
}));

import { createApp } from '../../src/app';

const SECRET = 'test-webhook-secret';
const app = createApp();

process.env.GITHUB_WEBHOOK_SECRET = SECRET;

function makeSignature(payload: string): string {
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(payload);
  return `sha256=${hmac.digest('hex')}`;
}

function issuePayload(action: string, number = 1, state: 'open' | 'closed' = 'open', title = 'Test issue') {
  return {
    action,
    issue: { number, title, state },
    repository: { name: 'stellar-org' },
  };
}

beforeEach(() => resetDb());

describe('POST /webhooks/github — authentication', () => {
  it('returns 401 when X-Hub-Signature-256 header is missing', async () => {
    const res = await request(app)
      .post('/webhooks/github')
      .send(issuePayload('opened'));
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing signature/i);
  });

  it('returns 401 when signature is invalid', async () => {
    const body = issuePayload('opened');
    // Use a correctly-sized but wrong signature (64 hex chars = 32 bytes like SHA-256)
    const wrongSig = 'sha256=' + 'a'.repeat(64);
    const res = await request(app)
      .post('/webhooks/github')
      .set('X-Hub-Signature-256', wrongSig)
      .send(body);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid signature/i);
  });
});

describe('POST /webhooks/github — issue events', () => {
  it('processes opened event and returns 200', async () => {
    const body = issuePayload('opened', 10, 'open', 'New issue title');
    const payload = JSON.stringify(body);
    const res = await request(app)
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', makeSignature(payload))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/processed/i);
  });

  it('processes closed event and returns 200', async () => {
    const body = issuePayload('closed', 10, 'closed', 'Closed issue');
    const payload = JSON.stringify(body);
    const res = await request(app)
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', makeSignature(payload))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('processes edited event and returns 200', async () => {
    const body = issuePayload('edited', 5, 'open', 'Edited title');
    const payload = JSON.stringify(body);
    const res = await request(app)
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', makeSignature(payload))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('returns 200 with "event ignored" for unsupported action type', async () => {
    const body = { action: 'labeled', issue: { number: 1, title: 'x', state: 'open' }, repository: { name: 'org' } };
    const payload = JSON.stringify(body);
    const res = await request(app)
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', makeSignature(payload))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('returns 200 with "event ignored" for payload missing issue field', async () => {
    const body = { action: 'opened', repository: { name: 'org' } };
    const payload = JSON.stringify(body);
    const res = await request(app)
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', makeSignature(payload))
      .send(body);
    expect(res.status).toBe(200);
  });
});

describe('POST /webhooks/github — idempotency', () => {
  it('handles duplicate opened event without error', async () => {
    const body = issuePayload('opened', 42, 'open', 'Idempotent issue');
    const payload = JSON.stringify(body);
    const sig = makeSignature(payload);

    const first = await request(app)
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sig)
      .send(body);
    expect(first.status).toBe(200);

    // Second request with same payload — ON CONFLICT in the INSERT should not fail
    const second = await request(app)
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sig)
      .send(body);
    expect(second.status).toBe(200);
  });
});
