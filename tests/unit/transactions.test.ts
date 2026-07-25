import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import { createApp } from '../../src/app';
import { SorobanService } from '../../src/soroban';

// Fixed resource estimate returned by the mock
const FIXED_ESTIMATE = {
  fee: '50000',
  instructions: 500000,
  readBytes: 2000,
  writeBytes: 1000,
};

// Mock simulateTransaction on SorobanService so no live network is needed
jest.spyOn(SorobanService.prototype, 'simulate').mockResolvedValue(FIXED_ESTIMATE);

const app = createApp();

// Two valid Stellar G-addresses
const CONTRIBUTOR = Keypair.random().publicKey();
const MAINTAINER = Keypair.random().publicKey();
const ORG = 'org-a';
const ISSUE = 1;
const SEQ = '100';

describe('POST /api/transactions/apply — buildApplyTx', () => {
  it('returns XDR + resource estimates for valid input', async () => {
    const res = await request(app).post('/api/transactions/apply').send({
      contributor: CONTRIBUTOR, org_id: ORG, issue_id: ISSUE, sequence: SEQ,
    });
    expect(res.status).toBe(200);
    expect(res.body.xdr).toBeTruthy();
    expect(res.body).toMatchObject(FIXED_ESTIMATE);
  });

  it('returns 400 for invalid address format', async () => {
    const res = await request(app).post('/api/transactions/apply').send({
      contributor: 'not-an-address', org_id: ORG, issue_id: ISSUE, sequence: SEQ,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/api/transactions/apply').send({ org_id: ORG });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/transactions/withdraw — buildWithdrawTx', () => {
  it('returns XDR + resource estimates for valid input', async () => {
    const res = await request(app).post('/api/transactions/withdraw').send({
      contributor: CONTRIBUTOR, org_id: ORG, issue_id: ISSUE, sequence: SEQ,
    });
    expect(res.status).toBe(200);
    expect(res.body.xdr).toBeTruthy();
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/api/transactions/withdraw').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/transactions/assign — buildAssignTx', () => {
  it('returns XDR + resource estimates for valid input', async () => {
    const res = await request(app).post('/api/transactions/assign').send({
      maintainer: MAINTAINER, contributor: CONTRIBUTOR,
      org_id: ORG, issue_id: ISSUE, sequence: SEQ,
    });
    expect(res.status).toBe(200);
    expect(res.body.xdr).toBeTruthy();
  });

  it('returns 400 for invalid maintainer address', async () => {
    const res = await request(app).post('/api/transactions/assign').send({
      maintainer: 'bad', contributor: CONTRIBUTOR,
      org_id: ORG, issue_id: ISSUE, sequence: SEQ,
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/transactions/complete — buildCompleteTx', () => {
  it('returns XDR + resource estimates for valid input', async () => {
    const res = await request(app).post('/api/transactions/complete').send({
      maintainer: MAINTAINER, contributor: CONTRIBUTOR,
      org_id: ORG, issue_id: ISSUE, sequence: SEQ,
    });
    expect(res.status).toBe(200);
    expect(res.body.xdr).toBeTruthy();
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/api/transactions/complete').send({
      maintainer: MAINTAINER,
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/transactions/revoke — buildRevokeTx', () => {
  it('returns XDR + resource estimates for valid input', async () => {
    const res = await request(app).post('/api/transactions/revoke').send({
      maintainer: MAINTAINER, contributor: CONTRIBUTOR,
      org_id: ORG, issue_id: ISSUE, sequence: SEQ,
    });
    expect(res.status).toBe(200);
    expect(res.body.xdr).toBeTruthy();
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/api/transactions/revoke').send({
      contributor: CONTRIBUTOR,
    });
    expect(res.status).toBe(400);
  });
});
