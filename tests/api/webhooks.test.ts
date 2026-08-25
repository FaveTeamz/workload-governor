/**
 * Integration tests for POST /webhooks/github.
 *
 * Covers all 7 required cases:
 * 1. Valid HMAC signature passes; invalid signature returns 401
 * 2. issues.opened event creates issue in DB
 * 3. issues.closed event marks assignments as pending-review
 * 4. issues.labeled with "good first issue" upserts issue and creates label record
 * 5. issues.unlabeled removes "good first issue" label record
 * 6. Unknown event type returns 200 with no DB changes
 * 7. Malformed JSON body returns 400
 */

import request from 'supertest';
import crypto from 'crypto';
import { MockPool, resetDb, tbl } from './setup';

// Mock pg pool before any imports that use it
const mockPool = new MockPool();
jest.mock('../../src/db', () => ({
  pool: mockPool,
  migrate: jest.fn(),
  healthCheck: jest.fn(),
}));

// Mock Redis so no real Redis connection is required
jest.mock('../../src/services/redis', () => ({
  invalidateCache: jest.fn().mockResolvedValue(undefined),
  getCached: jest.fn().mockResolvedValue(null),
  setCached: jest.fn().mockResolvedValue(undefined),
}));

import { createApp } from '../../src/app';

const SECRET = 'test-webhook-secret';
process.env.GITHUB_WEBHOOK_SECRET = SECRET;

const app = createApp();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a valid X-Hub-Signature-256 header for the given serialised payload. */
function hmacSignature(payload: string): string {
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(payload);
  return `sha256=${hmac.digest('hex')}`;
}

/** Build a standard issues payload. */
function issuePayload(
  action: string,
  number = 1,
  state: 'open' | 'closed' = 'open',
  title = 'Test issue',
  label?: string,
) {
  const body: Record<string, unknown> = {
    action,
    issue: { number, title, state },
    repository: { name: 'stellar-org' },
  };
  if (label !== undefined) {
    body.label = { name: label };
  }
  return body;
}

/** POST /webhooks/github with a valid signature. */
async function postWebhook(body: Record<string, unknown>) {
  const payload = JSON.stringify(body);
  return request(app)
    .post('/webhooks/github')
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', hmacSignature(payload))
    .send(body);
}

// ---------------------------------------------------------------------------
// Test isolation
// ---------------------------------------------------------------------------

beforeEach(() => resetDb());

// ===========================================================================
// 1. HMAC authentication
// ===========================================================================
describe('POST /webhooks/github — HMAC authentication', () => {
  it('returns 401 when X-Hub-Signature-256 header is missing', async () => {
    const res = await request(app)
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .send(issuePayload('opened'));

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing signature/i);
  });

  it('returns 401 when signature is invalid (wrong key)', async () => {
    const body = issuePayload('opened');
    const payload = JSON.stringify(body);
    // Sign with a different secret
    const wrongHmac = crypto.createHmac('sha256', 'wrong-secret');
    wrongHmac.update(payload);
    const wrongSig = `sha256=${wrongHmac.digest('hex')}`;

    const res = await request(app)
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', wrongSig)
      .send(body);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid signature/i);
  });

  it('returns 200 when a valid HMAC signature is provided', async () => {
    const res = await postWebhook(issuePayload('opened', 99, 'open', 'Auth check'));
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// 2. issues.opened → creates issue row in DB
// ===========================================================================
describe('POST /webhooks/github — issues.opened', () => {
  it('creates an issue row in the issues table', async () => {
    const res = await postWebhook(issuePayload('opened', 10, 'open', 'New feature'));

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/processed/i);

    const issues = tbl('issues');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      org_id: 'stellar-org',
      title: 'New feature',
      status: 'open',
    });
  });
});

// ===========================================================================
// 3. issues.closed → marks assignments as pending-review
// ===========================================================================
describe('POST /webhooks/github — issues.closed', () => {
  it('marks all assignments for the closed issue as pending-review', async () => {
    // Pre-seed an assignment (issue_id matches the issue.number we will close)
    tbl('assignments').push({
      id: 1,
      contributor: 'alice',
      org_id: 'stellar-org',
      issue_id: 7,
      status: 'active',
      created_at: new Date().toISOString(),
    });
    tbl('assignments').push({
      id: 2,
      contributor: 'bob',
      org_id: 'stellar-org',
      issue_id: 7,
      status: 'active',
      created_at: new Date().toISOString(),
    });
    // A different issue — should NOT be affected
    tbl('assignments').push({
      id: 3,
      contributor: 'carol',
      org_id: 'stellar-org',
      issue_id: 99,
      status: 'active',
      created_at: new Date().toISOString(),
    });

    const res = await postWebhook(issuePayload('closed', 7, 'closed', 'Bug fix'));

    expect(res.status).toBe(200);

    const assignments = tbl('assignments');
    // issue_id 7 → both should be pending-review
    const affected = assignments.filter((a) => a.issue_id === 7);
    expect(affected).toHaveLength(2);
    affected.forEach((a) => expect(a.status).toBe('pending-review'));

    // issue_id 99 → untouched
    const unaffected = assignments.filter((a) => a.issue_id === 99);
    expect(unaffected).toHaveLength(1);
    expect(unaffected[0].status).toBe('active');
  });
});

// ===========================================================================
// 4. issues.labeled with "good first issue" → upserts issue + label_record
// ===========================================================================
describe('POST /webhooks/github — issues.labeled (good first issue)', () => {
  it('upserts the issue and inserts a label_record row', async () => {
    const res = await postWebhook(
      issuePayload('labeled', 5, 'open', 'Easy win', 'good first issue'),
    );

    expect(res.status).toBe(200);

    // Issue should have been upserted
    const issues = tbl('issues');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ org_id: 'stellar-org', title: 'Easy win' });

    // label_record should exist
    const labelRecords = tbl('label_records');
    expect(labelRecords).toHaveLength(1);
    expect(labelRecords[0]).toMatchObject({
      org_id: 'stellar-org',
      issue_number: 5,
      label: 'good first issue',
    });
  });

  it('returns 200 with event ignored for non-good-first-issue labels', async () => {
    const res = await postWebhook(
      issuePayload('labeled', 5, 'open', 'Unrelated', 'wontfix'),
    );

    expect(res.status).toBe(200);
    // No DB changes
    expect(tbl('issues')).toHaveLength(0);
    expect(tbl('label_records')).toHaveLength(0);
  });
});

// ===========================================================================
// 5. issues.unlabeled → removes "good first issue" label record
// ===========================================================================
describe('POST /webhooks/github — issues.unlabeled (good first issue)', () => {
  it('deletes the label_record for the good-first-issue label', async () => {
    // Pre-seed label record
    tbl('label_records').push({
      id: 1,
      org_id: 'stellar-org',
      issue_number: 5,
      label: 'good first issue',
      created_at: new Date().toISOString(),
    });
    // A second record for a different label — should be untouched
    tbl('label_records').push({
      id: 2,
      org_id: 'stellar-org',
      issue_number: 5,
      label: 'bug',
      created_at: new Date().toISOString(),
    });

    const res = await postWebhook(
      issuePayload('unlabeled', 5, 'open', 'Easy win', 'good first issue'),
    );

    expect(res.status).toBe(200);

    const labelRecords = tbl('label_records');
    // The good-first-issue record should be gone
    const gfi = labelRecords.filter((r) => r.label === 'good first issue');
    expect(gfi).toHaveLength(0);
    // Other label records untouched
    const bug = labelRecords.filter((r) => r.label === 'bug');
    expect(bug).toHaveLength(1);
  });
});

// ===========================================================================
// 6. Unknown event type → 200, no DB changes
// ===========================================================================
describe('POST /webhooks/github — unknown event type', () => {
  it('returns 200 and makes no DB changes for an unsupported action', async () => {
    const res = await postWebhook({
      action: 'pinned',
      issue: { number: 1, title: 'Some issue', state: 'open' },
      repository: { name: 'stellar-org' },
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/not supported/i);

    // Nothing should have been written to the DB
    expect(tbl('issues')).toHaveLength(0);
    expect(tbl('assignments')).toHaveLength(0);
    expect(tbl('label_records')).toHaveLength(0);
  });
});

// ===========================================================================
// 7. Malformed JSON body → 400
// ===========================================================================
describe('POST /webhooks/github — malformed JSON', () => {
  it('returns 400 when the request body is not valid JSON', async () => {
    const malformed = 'this is not json {{{';
    const sig = hmacSignature(malformed);

    const res = await request(app)
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sig)
      .send(malformed);

    expect(res.status).toBe(400);
  });
});
