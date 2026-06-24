import request from 'supertest';
import { createApp } from '../../src/app';
import { pool } from '../../src/db';
import { resetDb } from './setup';

const app = createApp();

beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/testdb';
  await resetDb();
  // seed two issues
  await pool.query(
    `INSERT INTO issues (org_id, title, status) VALUES
      ('org-a', 'Fix bug', 'open'),
      ('org-b', 'Add feature', 'closed')`,
  );
});

afterAll(() => pool.end());

describe('GET /api/issues', () => {
  it('returns all issues', async () => {
    const res = await request(app).get('/api/issues');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('filters by org_id', async () => {
    const res = await request(app).get('/api/issues?org_id=org-a');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].org_id).toBe('org-a');
  });

  it('filters by status', async () => {
    const res = await request(app).get('/api/issues?status=closed');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('closed');
  });

  it('filters by org_id and status combined', async () => {
    const res = await request(app).get('/api/issues?org_id=org-a&status=open');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('returns empty array when no match', async () => {
    const res = await request(app).get('/api/issues?org_id=nonexistent');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
