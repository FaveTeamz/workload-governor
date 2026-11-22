import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import nacl from 'tweetnacl';
import { MockPool, resetDb } from './setup';

const mockPool = new MockPool();
jest.mock('../../src/db', () => ({
  pool: mockPool,
  migrate: jest.fn(),
  healthCheck: jest.fn(),
}));

import { createApp } from '../../src/app';

const app = createApp();
const adminKp = Keypair.random();
const maintainerKp = Keypair.random();

function makeAuthHeader(kp: Keypair, message = 'register-maintainer'): string {
  const naclKp = nacl.sign.keyPair.fromSeed(kp.rawSecretKey());
  const sig = nacl.sign.detached(Buffer.from(message, 'utf-8'), naclKp.secretKey);
  const payload = {
    admin_address: kp.publicKey(),
    message,
    signature: Buffer.from(sig).toString('base64'),
  };
  return 'Bearer ' + Buffer.from(JSON.stringify(payload)).toString('base64');
}

beforeEach(() => resetDb());

// ---------------------------------------------------------------------------
// Existing tests: POST /api/admin/maintainers
// ---------------------------------------------------------------------------

describe('POST /api/admin/maintainers', () => {
  it('returns 401 with no Authorization header', async () => {
    const res = await request(app)
      .post('/api/admin/maintainers')
      .send({ maintainer_address: maintainerKp.publicKey(), org_id: 'org-a', sequence: '100' });
    expect(res.status).toBe(401);
  });

  it('returns 401 with malformed token', async () => {
    const res = await request(app)
      .post('/api/admin/maintainers')
      .set('Authorization', 'Bearer bm90LXZhbGlk')
      .send({ maintainer_address: maintainerKp.publicKey(), org_id: 'org-a', sequence: '100' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when required body fields are missing', async () => {
    const res = await request(app)
      .post('/api/admin/maintainers')
      .set('Authorization', makeAuthHeader(adminKp))
      .send({ org_id: 'org-a', sequence: '100' });
    expect(res.status).toBe(400);
  });

  it('returns 200 with XDR for valid auth and body', async () => {
    const res = await request(app)
      .post('/api/admin/maintainers')
      .set('Authorization', makeAuthHeader(adminKp))
      .send({ maintainer_address: maintainerKp.publicKey(), org_id: 'org-a', sequence: '100' });
    expect(res.status).toBe(200);
    expect(res.body.xdr).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// New tests: POST /api/admin/caps  (issue #841)
// ---------------------------------------------------------------------------

describe('POST /api/admin/caps – validation', () => {
  it('returns 401 without auth header', async () => {
    const res = await request(app)
      .post('/api/admin/caps')
      .send({ global_cap: 15, per_org_cap: 4 });
    expect(res.status).toBe(401);
  });

  it('returns 400 when global_cap is missing', async () => {
    const res = await request(app)
      .post('/api/admin/caps')
      .set('Authorization', makeAuthHeader(adminKp, 'register-maintainer'))
      .send({ per_org_cap: 4 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/validation failed/i);
    expect(res.body.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'global_cap' }),
      ]),
    );
  });

  it('returns 400 when per_org_cap is missing', async () => {
    const res = await request(app)
      .post('/api/admin/caps')
      .set('Authorization', makeAuthHeader(adminKp, 'register-maintainer'))
      .send({ global_cap: 15 });
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'per_org_cap' }),
      ]),
    );
  });

  it('returns 400 when global_cap is 0', async () => {
    const res = await request(app)
      .post('/api/admin/caps')
      .set('Authorization', makeAuthHeader(adminKp, 'register-maintainer'))
      .send({ global_cap: 0, per_org_cap: 4 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when global_cap is negative', async () => {
    const res = await request(app)
      .post('/api/admin/caps')
      .set('Authorization', makeAuthHeader(adminKp, 'register-maintainer'))
      .send({ global_cap: -1, per_org_cap: 4 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when global_cap exceeds 100', async () => {
    const res = await request(app)
      .post('/api/admin/caps')
      .set('Authorization', makeAuthHeader(adminKp, 'register-maintainer'))
      .send({ global_cap: 101, per_org_cap: 4 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when per_org_cap exceeds 20', async () => {
    const res = await request(app)
      .post('/api/admin/caps')
      .set('Authorization', makeAuthHeader(adminKp, 'register-maintainer'))
      .send({ global_cap: 15, per_org_cap: 21 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when per_org_cap is not an integer', async () => {
    const res = await request(app)
      .post('/api/admin/caps')
      .set('Authorization', makeAuthHeader(adminKp, 'register-maintainer'))
      .send({ global_cap: 15, per_org_cap: 3.5 });
    expect(res.status).toBe(400);
  });

  it('returns 200 for valid cap values', async () => {
    const res = await request(app)
      .post('/api/admin/caps')
      .set('Authorization', makeAuthHeader(adminKp, 'register-maintainer'))
      .send({ global_cap: 15, per_org_cap: 4 });
    expect(res.status).toBe(200);
    expect(res.body.global_cap).toBe(15);
    expect(res.body.per_org_cap).toBe(4);
  });

  it('returns 200 for boundary values (global_cap=1, per_org_cap=1)', async () => {
    const res = await request(app)
      .post('/api/admin/caps')
      .set('Authorization', makeAuthHeader(adminKp, 'register-maintainer'))
      .send({ global_cap: 1, per_org_cap: 1 });
    expect(res.status).toBe(200);
  });

  it('returns 200 for boundary values (global_cap=100, per_org_cap=20)', async () => {
    const res = await request(app)
      .post('/api/admin/caps')
      .set('Authorization', makeAuthHeader(adminKp, 'register-maintainer'))
      .send({ global_cap: 100, per_org_cap: 20 });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Audit logging: POST /api/admin/caps writes to audit_logs
// ---------------------------------------------------------------------------

describe('POST /api/admin/caps – audit logging', () => {
  it('writes an audit_logs entry after a successful cap update', async () => {
    await request(app)
      .post('/api/admin/caps')
      .set('Authorization', makeAuthHeader(adminKp, 'register-maintainer'))
      .send({ global_cap: 10, per_org_cap: 3 });

    // Give the fire-and-forget audit write a tick to complete
    await new Promise((r) => setImmediate(r));

    const result = await mockPool.query('SELECT * FROM audit_logs', []);
    expect(result.rows.length).toBeGreaterThanOrEqual(1);

    const entry = result.rows[0] as Record<string, unknown>;
    expect(entry.event_type).toBe('cap_update');
    expect(typeof entry.actor).toBe('string');
  });

  it('records the new cap values in the audit entry', async () => {
    await request(app)
      .post('/api/admin/caps')
      .set('Authorization', makeAuthHeader(adminKp, 'register-maintainer'))
      .send({ global_cap: 20, per_org_cap: 5 });

    await new Promise((r) => setImmediate(r));

    const result = await mockPool.query('SELECT * FROM audit_logs', []);
    const entry = result.rows.find(
      (r) => (r as Record<string, unknown>).event_type === 'cap_update',
    ) as Record<string, unknown> | undefined;

    expect(entry).toBeDefined();
    // new_value is stored as a JSON string in the mock DB
    const newVal = JSON.parse(entry!.new_value as string) as { global_cap: number; per_org_cap: number };
    expect(newVal.global_cap).toBe(20);
    expect(newVal.per_org_cap).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Audit log retrieval: GET /api/v1/audit/logs reflects cap modification events
// ---------------------------------------------------------------------------

describe('GET /api/v1/audit/logs', () => {
  it('returns 200 with a list of audit logs', async () => {
    // Seed a cap update first
    await request(app)
      .post('/api/admin/caps')
      .set('Authorization', makeAuthHeader(adminKp, 'register-maintainer'))
      .send({ global_cap: 10, per_org_cap: 3 });

    await new Promise((r) => setImmediate(r));

    const res = await request(app).get('/api/v1/audit/logs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });

  it('filters by event_type=cap_update', async () => {
    await request(app)
      .post('/api/admin/caps')
      .set('Authorization', makeAuthHeader(adminKp, 'register-maintainer'))
      .send({ global_cap: 10, per_org_cap: 3 });

    await new Promise((r) => setImmediate(r));

    const res = await request(app).get('/api/v1/audit/logs?event_type=cap_update');
    expect(res.status).toBe(200);
    expect(
      (res.body.logs as Array<Record<string, unknown>>).every(
        (l) => l.event_type === 'cap_update',
      ),
    ).toBe(true);
  });
});
