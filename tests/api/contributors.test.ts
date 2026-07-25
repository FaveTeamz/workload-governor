import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import { MockPool, resetDb } from './setup';

const mockPool = new MockPool();
jest.mock('../../src/db', () => ({
  pool: mockPool,
  migrate: jest.fn(),
  healthCheck: jest.fn(),
}));

import { createApp } from '../../src/app';

const app = createApp();
const ADDR = Keypair.random().publicKey();

beforeEach(async () => {
  resetDb();
  const { rows } = await mockPool.query(
    `INSERT INTO issues (org_id, title, status) VALUES ('org-a', 'Issue 1', 'open') RETURNING id`,
  );
  const issueId = rows[0].id;
  await mockPool.query(
    `INSERT INTO applications (contributor, org_id, issue_id) VALUES ($1, $2, $3)`,
    [ADDR, 'org-a', issueId],
  );
  await mockPool.query(
    `INSERT INTO assignments (contributor, org_id, issue_id) VALUES ($1, $2, $3)`,
    [ADDR, 'org-a', issueId],
  );
});

describe('GET /api/contributors/:address/applications', () => {
  it('returns 400 for invalid stellar address', async () => {
    const res = await request(app).get('/api/contributors/bad-addr/applications');
    expect(res.status).toBe(400);
  });

  it('returns 200 for valid address', async () => {
    const res = await request(app).get(`/api/contributors/${ADDR}/applications`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/contributors/:address/assignments', () => {
  it('returns 400 for invalid stellar address', async () => {
    const res = await request(app).get('/api/contributors/bad-addr/assignments');
    expect(res.status).toBe(400);
  });

  it('returns 200 for valid address', async () => {
    const res = await request(app).get(`/api/contributors/${ADDR}/assignments`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/contributors/:address/counts', () => {
  it('returns 400 for invalid stellar address', async () => {
    const res = await request(app).get('/api/contributors/bad-addr/counts');
    expect(res.status).toBe(400);
  });

  it('returns 200 with count fields for valid address', async () => {
    const res = await request(app).get(`/api/contributors/${ADDR}/counts`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalApplications');
    expect(res.body).toHaveProperty('totalAssignments');
  });
});
