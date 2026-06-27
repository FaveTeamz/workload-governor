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
