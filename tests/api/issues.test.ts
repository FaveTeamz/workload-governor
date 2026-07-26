import request from 'supertest';
import { MockPool, resetDb } from './setup';

// Mock pg pool before any imports that use it
const mockPool = new MockPool();
jest.mock('../../src/db', () => ({
  pool: mockPool,
  migrate: jest.fn(),
  healthCheck: jest.fn(),
}));

import { createApp } from '../../src/app';

const app = createApp();

beforeEach(async () => {
  resetDb();
  await mockPool.query(
    `INSERT INTO issues (org_id, title, status) VALUES ('org-a', 'Fix bug', 'open')`,
  );
  await mockPool.query(
    `INSERT INTO issues (org_id, title, status) VALUES ('org-b', 'Add feature', 'closed')`,
  );
});

describe('GET /api/issues', () => {
  it('returns paginated issues', async () => {
    const res = await request(app).get('/api/issues');
    expect(res.status).toBe(200);
    expect(res.body.issues).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(1);
  });

  it('filters by org_id', async () => {
    const res = await request(app).get('/api/issues?org_id=org-a');
    expect(res.status).toBe(200);
    expect(res.body.issues).toHaveLength(1);
    expect(res.body.issues[0].org_id).toBe('org-a');
  });

  it('filters by status=closed', async () => {
    const res = await request(app).get('/api/issues?status=closed');
    expect(res.status).toBe(200);
    expect(res.body.issues).toHaveLength(1);
    expect(res.body.issues[0].status).toBe('closed');
  });

  it('returns empty when no match', async () => {
    const res = await request(app).get('/api/issues?org_id=nonexistent');
    expect(res.status).toBe(200);
    expect(res.body.issues).toEqual([]);
    expect(res.body.total).toBe(0);
  });
});
