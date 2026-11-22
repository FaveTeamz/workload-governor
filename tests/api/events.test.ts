import request from 'supertest';
import { MockPool, resetDb } from './setup';

const mockPool = new MockPool();
jest.mock('../../src/db', () => ({
  pool: mockPool,
  migrate: jest.fn(),
  healthCheck: jest.fn(),
}));

import { createApp } from '../../src/app';

const app = createApp();

async function insertEvent(eventType: string, ledger: number, orgId: string) {
  return mockPool.query(
    `INSERT INTO contract_events (event_type, ledger_seq, timestamp, actor, org_id, issue_id, contributor, data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [eventType, ledger, new Date().toISOString(), 'GACTOR', orgId, 1, 'GCONT', '{}'],
  );
}

beforeEach(async () => {
  resetDb();
  await insertEvent('applied', 1, 'org-a');
  await insertEvent('assigned', 2, 'org-a');
  await insertEvent('applied', 3, 'org-b');
});

describe('GET /api/events', () => {
  it('returns all events with pagination metadata', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(3);
    expect(res.body.pagination.total).toBe(3);
  });

  it('filters by org_id', async () => {
    const res = await request(app).get('/api/events?org_id=org-a');
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(2);
  });

  it('filters by event_type', async () => {
    const res = await request(app).get('/api/events?event_type=applied');
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(2);
  });

  it('respects limit', async () => {
    const res = await request(app).get('/api/events?limit=1');
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.pagination.hasMore).toBe(true);
  });
});
