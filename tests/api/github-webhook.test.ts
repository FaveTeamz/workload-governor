/**
 * Integration tests for POST /webhooks/github.
 *
 * Covers:
 * 1. Valid HMAC signature passes; invalid signature returns 401
 * 2. issues.opened  — creates a row in the issues table
 * 3. issues.closed  — marks related assignments as pending-review
 * 4. issues.labeled (good first issue) — upserts a row in github_issue_labels
 * 5. issues.unlabeled — removes the good-first-issue label record
 * 6. Unknown event type — 200 with no DB changes
 * 7. Malformed JSON body — 400
 */

import request from 'supertest';
import crypto from 'crypto';
import { MockPool, resetDb, getTable } from './setup';

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

import { createApp } from '../../src/app';

const SECRET = 'test-webhook-secret';
process.env.GITHUB_WEBHOOK_SECRET = SECRET;

const app = createApp();

// ---------- helpers -------------------------------------------------------

function sign(body: string): string {
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(body);
  return `sha256=${hmac.digest('hex')}`;
}

function issueEvent(
  action: string,
  number = 1,
  title = 'Test issue',
  state: 'open' | 'closed' = 'open',
  extra: Record<string, unknown> = {},
) {
  return {
    action,
    issue: { number, title, state },
    repository: { name: 'test-org' },
    ...extra,
  };
}

async function post(body: object | string, sigOverride?: string) {
  const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
  const sig = sigOverride ?? sign(rawBody);
  return request(app)
    .post('/webhooks/github')
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', sig)
    .send(rawBody);
}

beforeEach(() => resetDb());

// ---------- 1. HMAC authentication ----------------------------------------

describe('HMAC authentication', () => {
  it('returns 200 when signature is valid', async () => {
    const body = issueEvent('opened', 1, 'Valid signature test');
    const res = await post(body);
    expect(res.status).toBe(200);
  });

  it('returns 401 when X-Hub-Signature-256 header is missing', async () => {
    const res = await request(app)
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .send(issueEvent('opened'));
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing signature/i);
  });

  it('returns 401 when signature is invalid', async () => {
    const body = issueEvent('opened');
    const wrongSig = 'sha256=' + 'b'.repeat(64);
    const res = await post(body, wrongSig);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid signature/i);
  });
});

// ---------- 2. issues.opened — creates issue in DB -----------------------

describe('issues.opened', () => {
  it('inserts a new row into the issues table', async () => {
    const body = issueEvent('opened', 42, 'My new issue');
    const res = await post(body);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/processed/i);

    const issues = getTable('issues');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      org_id: 'test-org',
      title: 'My new issue',
      status: 'open',
    });
  });
});

// ---------- 3. issues.closed — marks assignments as pending-review --------

describe('issues.closed', () => {
  it('sets assignment status to pending-review', async () => {
    // Pre-seed an assignment for this issue
    const assignmentsBefore = getTable('assignments');
    assignmentsBefore.push({
      contributor: 'alice',
      org_id: 'test-org',
      issue_id: 10,
      status: 'active',
      created_at: new Date().toISOString(),
    });

    // Directly manipulate the in-memory tables via runQuery (seed via MockPool)
    await mockPool.query(
      `INSERT INTO assignments (contributor, org_id, issue_id, status) VALUES ($1, $2, $3, $4)`,
      ['alice', 'test-org', 10, 'active'],
    );

    const body = issueEvent('closed', 10, 'Closed issue', 'closed');
    const res = await post(body);

    expect(res.status).toBe(200);

    const assignments = getTable('assignments');
    const aliceAssignment = assignments.find((a) => a.contributor === 'alice' && a.issue_id === 10);
    expect(aliceAssignment).toBeDefined();
    expect(aliceAssignment?.status).toBe('pending-review');
  });
});

// ---------- 4. issues.labeled — upserts good-first-issue label -----------

describe('issues.labeled', () => {
  it('inserts a github_issue_labels row when label is "good first issue"', async () => {
    const body = issueEvent('labeled', 7, 'Beginner task', 'open', {
      label: { name: 'good first issue' },
    });
    const res = await post(body);

    expect(res.status).toBe(200);

    const labels = getTable('github_issue_labels');
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({
      org_id: 'test-org',
      issue_id: 7,
      label_name: 'good first issue',
    });
  });

  it('does NOT insert a row for unrelated labels', async () => {
    const body = issueEvent('labeled', 8, 'Tagged issue', 'open', {
      label: { name: 'bug' },
    });
    const res = await post(body);

    expect(res.status).toBe(200);
    expect(getTable('github_issue_labels')).toHaveLength(0);
  });
});

// ---------- 5. issues.unlabeled — removes good-first-issue label ---------

describe('issues.unlabeled', () => {
  it('removes the github_issue_labels row for "good first issue"', async () => {
    // Seed the label row first
    await mockPool.query(
      `INSERT INTO github_issue_labels (org_id, issue_id, label_name) VALUES ($1, $2, $3)`,
      ['test-org', 9, 'good first issue'],
    );
    expect(getTable('github_issue_labels')).toHaveLength(1);

    const body = issueEvent('unlabeled', 9, 'Used to be beginner', 'open', {
      label: { name: 'good first issue' },
    });
    const res = await post(body);

    expect(res.status).toBe(200);
    expect(getTable('github_issue_labels')).toHaveLength(0);
  });
});

// ---------- 6. Unknown event type — 200, no DB changes -------------------

describe('unknown event type', () => {
  it('returns 200 and makes no DB changes for an unsupported action', async () => {
    const body = issueEvent('assigned', 3, 'Some issue');
    const res = await post(body);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/not supported/i);
    // No rows should have been inserted into any tables
    expect(getTable('issues')).toHaveLength(0);
    expect(getTable('github_issue_labels')).toHaveLength(0);
  });
});

// ---------- 7. Malformed JSON body — 400 ---------------------------------

describe('malformed JSON body', () => {
  it('returns 400 when the body is not valid JSON', async () => {
    const malformed = '{"action": "opened", broken json';
    const sig = sign(malformed);

    const res = await request(app)
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sig)
      .send(malformed);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/malformed/i);
  });
});
