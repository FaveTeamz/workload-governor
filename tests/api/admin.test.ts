import request from 'supertest';
import { createApp } from '../../src/app';
import { pool } from '../../src/db';
import { resetDb } from './setup';

const app = createApp();
const TOKEN = 'test-admin-token';

beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/testdb';
  process.env.ADMIN_TOKEN = TOKEN;
  await resetDb();
});

afterAll(() => pool.end());

describe('POST /api/admin/maintainers', () => {
  it('registers a maintainer with valid auth', async () => {
    const res = await request(app)
      .post('/api/admin/maintainers')
      .set('x-admin-token', TOKEN)
      .send({ address: 'GMAINT1', org_id: 'org-a' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ address: 'GMAINT1', org_id: 'org-a' });
  });

  it('is idempotent on duplicate registration', async () => {
    const res = await request(app)
      .post('/api/admin/maintainers')
      .set('x-admin-token', TOKEN)
      .send({ address: 'GMAINT1', org_id: 'org-a' });
    expect(res.status).toBe(201);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app)
      .post('/api/admin/maintainers')
      .send({ address: 'GMAINT2', org_id: 'org-b' });
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong token', async () => {
    const res = await request(app)
      .post('/api/admin/maintainers')
      .set('x-admin-token', 'bad-token')
      .send({ address: 'GMAINT2', org_id: 'org-b' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when body fields are missing', async () => {
    const res = await request(app)
      .post('/api/admin/maintainers')
      .set('x-admin-token', TOKEN)
      .send({ address: 'GMAINT3' }); // missing org_id
    expect(res.status).toBe(400);
  });
});
