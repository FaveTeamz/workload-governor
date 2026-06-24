import request from 'supertest';
import { createApp } from '../../src/app';
import { pool } from '../../src/db';
import { resetDb } from './setup';

const app = createApp();
const ADDR = 'GCONTRIBUTOR123';

beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/testdb';
  await resetDb();

  const { rows } = await pool.query(
    `INSERT INTO issues (org_id, title, status) VALUES ('org-a', 'Issue 1', 'open') RETURNING id`,
  );
  const issueId: number = rows[0].id;

  await pool.query(
    `INSERT INTO applications (contributor, org_id, issue_id) VALUES ($1, 'org-a', $2)`,
    [ADDR, issueId],
  );
  await pool.query(
    `INSERT INTO assignments (contributor, org_id, issue_id) VALUES ($1, 'org-a', $2)`,
    [ADDR, issueId],
  );
});

afterAll(() => pool.end());

describe('GET /api/contributors/:address/applications', () => {
  it('returns applications for known contributor', async () => {
    const res = await request(app).get(`/api/contributors/${ADDR}/applications`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].contributor).toBe(ADDR);
  });

  it('returns empty array for unknown contributor', async () => {
    const res = await request(app).get('/api/contributors/UNKNOWN/applications');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/contributors/:address/assignments', () => {
  it('returns assignments for known contributor', async () => {
    const res = await request(app).get(`/api/contributors/${ADDR}/assignments`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].contributor).toBe(ADDR);
  });

  it('returns empty array for unknown contributor', async () => {
    const res = await request(app).get('/api/contributors/UNKNOWN/assignments');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
