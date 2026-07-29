/**
 * admin.test.ts  (tests/api)
 *
 * Integration tests for:
 *   POST /api/admin/maintainers  — existing endpoint, kept for regression
 *   POST /api/admin/orgs         — new endpoint
 *
 * Coverage for POST /api/admin/orgs:
 *  1. Valid request registers org and all maintainers → 201
 *  2. GitHub org validation: unknown org → 422
 *  3. GitHub API hard error (5xx) → 502
 *  4. Duplicate org_id → 409
 *  5. Maintainer contract call fails → 502 + DB rollback
 *  6. Missing Authorization header → 401
 *  7. Malformed Authorization token → 401
 *  8. Body validation error (missing required fields) → 400
 *  9. org_cap defaults to 4 when omitted
 * 10. First maintainer succeeds, second fails → rollback removes the org row
 */

import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import nacl from 'tweetnacl';
import { MockPool, resetDb, tbl } from './setup';

// ── Mock DB before the app is imported ─────────────────────────────────────

const mockPool = new MockPool();
jest.mock('../../src/db', () => ({
  pool: mockPool,
  migrate: jest.fn(),
  healthCheck: jest.fn(),
}));

// ── Mock SorobanService ─────────────────────────────────────────────────────

const mockRegisterMaintainer = jest.fn();
const mockBuildRawTransaction = jest.fn();

jest.mock('../../src/soroban', () => ({
  SorobanService: jest.fn().mockImplementation(() => ({
    registerMaintainer: mockRegisterMaintainer,
    buildRawTransaction: mockBuildRawTransaction,
  })),
}));

// ── Mock GitHubService ──────────────────────────────────────────────────────

const mockValidateOrg = jest.fn();

jest.mock('../../src/github', () => ({
  GitHubService: jest.fn().mockImplementation(() => ({
    validateOrg: mockValidateOrg,
  })),
}));

// Import app after all mocks are set up
import { createApp } from '../../src/app';

const app = createApp();

// ── Helpers ─────────────────────────────────────────────────────────────────

const adminKp = Keypair.random();
const maintainerKp = Keypair.random();
const maintainer2Kp = Keypair.random();

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

/** A valid POST /api/admin/orgs body */
function validOrgBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    github_org: 'stellar',
    org_id: 'stellar-oss',
    maintainers: [maintainerKp.publicKey()],
    ...overrides,
  };
}

beforeEach(() => {
  resetDb();
  jest.clearAllMocks();

  // Default: GitHub org exists
  mockValidateOrg.mockResolvedValue(true);

  // Default: contract call succeeds
  mockRegisterMaintainer.mockResolvedValue({ status: 'success', hash: 'abc123' });

  // Default: buildRawTransaction returns a minimal stub with .toXDR()
  mockBuildRawTransaction.mockReturnValue({ toXDR: () => 'mock-xdr' });
});

// ── POST /api/admin/maintainers (regression) ─────────────────────────────────

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

// ── POST /api/admin/orgs ────────────────────────────────────────────────────

describe('POST /api/admin/orgs', () => {
  // ── Auth guard ──────────────────────────────────────────────────────────

  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app)
      .post('/api/admin/orgs')
      .send(validOrgBody());
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'unauthorized');
  });

  it('returns 401 when Authorization header is malformed', async () => {
    const res = await request(app)
      .post('/api/admin/orgs')
      .set('Authorization', 'Bearer not-valid-base64-json')
      .send(validOrgBody());
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'unauthorized');
  });

  // ── Body validation ─────────────────────────────────────────────────────

  it('returns 400 when github_org is missing', async () => {
    const body = validOrgBody();
    delete body['github_org'];
    const res = await request(app)
      .post('/api/admin/orgs')
      .set('Authorization', makeAuthHeader(adminKp))
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'validation_error');
    expect(res.body.details).toHaveProperty('github_org');
  });

  it('returns 400 when org_id is missing', async () => {
    const body = validOrgBody();
    delete body['org_id'];
    const res = await request(app)
      .post('/api/admin/orgs')
      .set('Authorization', makeAuthHeader(adminKp))
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'validation_error');
  });

  it('returns 400 when maintainers array is empty', async () => {
    const res = await request(app)
      .post('/api/admin/orgs')
      .set('Authorization', makeAuthHeader(adminKp))
      .send(validOrgBody({ maintainers: [] }));
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'validation_error');
  });

  it('returns 400 when org_cap is out of range', async () => {
    const res = await request(app)
      .post('/api/admin/orgs')
      .set('Authorization', makeAuthHeader(adminKp))
      .send(validOrgBody({ org_cap: 100 }));
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'validation_error');
  });

  // ── GitHub org validation ───────────────────────────────────────────────

  it('returns 422 when the GitHub org does not exist', async () => {
    mockValidateOrg.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/admin/orgs')
      .set('Authorization', makeAuthHeader(adminKp))
      .send(validOrgBody({ github_org: 'this-org-does-not-exist' }));

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error', 'invalid_github_org');
    expect(mockValidateOrg).toHaveBeenCalledWith('this-org-does-not-exist');
  });

  it('returns 502 when the GitHub API throws an error', async () => {
    mockValidateOrg.mockRejectedValue(new Error('GitHub API error: 503 Service Unavailable'));

    const res = await request(app)
      .post('/api/admin/orgs')
      .set('Authorization', makeAuthHeader(adminKp))
      .send(validOrgBody());

    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error', 'github_api_error');
  });

  // ── Duplicate org_id ────────────────────────────────────────────────────

  it('returns 409 when org_id is already registered', async () => {
    // Pre-seed the orgs table with the same org_id
    tbl('orgs').push({ org_id: 'stellar-oss', github_org: 'stellar', org_cap: 4 });

    const res = await request(app)
      .post('/api/admin/orgs')
      .set('Authorization', makeAuthHeader(adminKp))
      .send(validOrgBody());

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error', 'conflict');
    // GitHub validation should have run, but DB insert should not
    expect(mockValidateOrg).toHaveBeenCalled();
    expect(mockRegisterMaintainer).not.toHaveBeenCalled();
  });

  // ── Happy path ──────────────────────────────────────────────────────────

  it('registers org and maintainers successfully, returns 201', async () => {
    const res = await request(app)
      .post('/api/admin/orgs')
      .set('Authorization', makeAuthHeader(adminKp))
      .send(validOrgBody({ org_cap: 5 }));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      org_id: 'stellar-oss',
      github_org: 'stellar',
      maintainers: [maintainerKp.publicKey()],
      org_cap: 5,
    });
    expect(res.body).toHaveProperty('message');

    // Verify the org was written to the DB
    const orgRows = tbl('orgs');
    expect(orgRows).toHaveLength(1);
    expect(orgRows[0]).toMatchObject({ org_id: 'stellar-oss', github_org: 'stellar', org_cap: 5 });

    // Verify register_maintainer was called once
    expect(mockRegisterMaintainer).toHaveBeenCalledTimes(1);
    expect(mockRegisterMaintainer).toHaveBeenCalledWith(
      adminKp.publicKey(),
      maintainerKp.publicKey(),
      'stellar-oss',
    );
  });

  it('org_cap defaults to 4 when not provided', async () => {
    const body = validOrgBody();
    delete body['org_cap'];

    const res = await request(app)
      .post('/api/admin/orgs')
      .set('Authorization', makeAuthHeader(adminKp))
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.org_cap).toBe(4);

    const orgRows = tbl('orgs');
    expect(orgRows[0]).toMatchObject({ org_cap: 4 });
  });

  it('calls register_maintainer for each maintainer when multiple are provided', async () => {
    const res = await request(app)
      .post('/api/admin/orgs')
      .set('Authorization', makeAuthHeader(adminKp))
      .send(
        validOrgBody({
          maintainers: [maintainerKp.publicKey(), maintainer2Kp.publicKey()],
        }),
      );

    expect(res.status).toBe(201);
    expect(mockRegisterMaintainer).toHaveBeenCalledTimes(2);
    expect(res.body.maintainers).toHaveLength(2);
  });

  // ── Rollback on contract failure ────────────────────────────────────────

  it('rolls back DB insert when the first maintainer contract call fails', async () => {
    mockRegisterMaintainer.mockRejectedValue(new Error('Contract: UnauthorizedAdmin'));

    const res = await request(app)
      .post('/api/admin/orgs')
      .set('Authorization', makeAuthHeader(adminKp))
      .send(validOrgBody());

    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error', 'contract_error');

    // The org row must have been removed by the rollback
    const orgRows = tbl('orgs');
    expect(orgRows).toHaveLength(0);
  });

  it('rolls back when the second of two maintainer calls fails', async () => {
    mockRegisterMaintainer
      .mockResolvedValueOnce({ status: 'success', hash: 'first-ok' })
      .mockRejectedValueOnce(new Error('Contract: UnauthorizedAdmin'));

    const res = await request(app)
      .post('/api/admin/orgs')
      .set('Authorization', makeAuthHeader(adminKp))
      .send(
        validOrgBody({
          maintainers: [maintainerKp.publicKey(), maintainer2Kp.publicKey()],
        }),
      );

    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error', 'contract_error');
    // Response includes list of already-registered maintainers before the failure
    expect(res.body.registered).toContain(maintainerKp.publicKey());

    // Org row must have been rolled back
    const orgRows = tbl('orgs');
    expect(orgRows).toHaveLength(0);
  });
});
