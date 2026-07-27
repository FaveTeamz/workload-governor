/**
 * Integration tests for /api/transactions endpoints.
 * Covers: happy paths for all 5 operations, 400 validation errors, 429 rate limit.
 */

import request from 'supertest';
import { Keypair, Transaction } from '@stellar/stellar-sdk';
import { MockPool, resetDb } from './setup';

const mockPool = new MockPool();
jest.mock('../../src/db', () => ({
  pool: mockPool,
  migrate: jest.fn(),
  healthCheck: jest.fn(),
}));

// Mock SorobanService so tests don't need a real Soroban node
jest.mock('../../src/soroban', () => {
  const { Keypair: _Keypair, TransactionBuilder, Networks, Account, Operation, BASE_FEE } =
    jest.requireActual('@stellar/stellar-sdk');
  function stubTx(): Transaction {
    const src = _Keypair.random().publicKey();
    const account = new Account(src, '0');
    return new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.inflation())
      .setTimeout(30)
      .build();
  }
  return {
    SorobanService: jest.fn().mockImplementation(() => ({
      simulate: jest.fn().mockResolvedValue({ fee: '100', instructions: 0, readBytes: 0, writeBytes: 0 }),
      buildApplyTx: jest.fn().mockReturnValue(stubTx()),
      buildWithdrawTx: jest.fn().mockReturnValue(stubTx()),
      buildAssignTx: jest.fn().mockReturnValue(stubTx()),
      buildCompleteTx: jest.fn().mockReturnValue(stubTx()),
      buildRevokeTx: jest.fn().mockReturnValue(stubTx()),
    })),
  };
});

import { createApp } from '../../src/app';

const app = createApp();
const contributor = Keypair.random().publicKey();
const maintainer = Keypair.random().publicKey();
const SEQ = '12345678901';

afterEach(() => resetDb());

describe('POST /api/transactions/apply', () => {
  it('returns 400 when contributor address is invalid', async () => {
    const res = await request(app)
      .post('/api/transactions/apply')
      .send({ contributor: 'NOT_AN_ADDR', org_id: 'org-a', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'contributor' })]),
    );
  });

  it('returns 400 when org_id is empty', async () => {
    const res = await request(app)
      .post('/api/transactions/apply')
      .send({ contributor, org_id: '', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(400);
  });

  it('returns 400 when issue_id is zero', async () => {
    const res = await request(app)
      .post('/api/transactions/apply')
      .send({ contributor, org_id: 'org-a', issue_id: 0, sequence: SEQ });
    expect(res.status).toBe(400);
  });

  it('returns 400 when issue_id is negative', async () => {
    const res = await request(app)
      .post('/api/transactions/apply')
      .send({ contributor, org_id: 'org-a', issue_id: -1, sequence: SEQ });
    expect(res.status).toBe(400);
  });

  it('returns 400 when sequence is missing', async () => {
    const res = await request(app)
      .post('/api/transactions/apply')
      .send({ contributor, org_id: 'org-a', issue_id: 1 });
    expect(res.status).toBe(400);
  });

  it('returns 200 with XDR for valid inputs', async () => {
    const res = await request(app)
      .post('/api/transactions/apply')
      .send({ contributor, org_id: 'org-a', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('xdr');
  });
});

describe('POST /api/transactions/withdraw', () => {
  it('returns 400 for invalid contributor', async () => {
    const res = await request(app)
      .post('/api/transactions/withdraw')
      .send({ contributor: 'bad', org_id: 'org-a', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(400);
  });

  it('returns 200 for valid inputs', async () => {
    const res = await request(app)
      .post('/api/transactions/withdraw')
      .send({ contributor, org_id: 'org-a', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('xdr');
  });
});

describe('POST /api/transactions/assign', () => {
  it('returns 400 when maintainer is missing', async () => {
    const res = await request(app)
      .post('/api/transactions/assign')
      .send({ contributor, org_id: 'org-a', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'maintainer' })]),
    );
  });

  it('returns 400 when contributor address is invalid', async () => {
    const res = await request(app)
      .post('/api/transactions/assign')
      .send({ maintainer, contributor: 'bad', org_id: 'org-a', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(400);
  });

  it('returns 200 for valid inputs', async () => {
    const res = await request(app)
      .post('/api/transactions/assign')
      .send({ maintainer, contributor, org_id: 'org-a', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('xdr');
  });
});

describe('POST /api/transactions/complete', () => {
  it('returns 400 for invalid maintainer', async () => {
    const res = await request(app)
      .post('/api/transactions/complete')
      .send({ maintainer: 'nope', contributor, org_id: 'org-a', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(400);
  });

  it('returns 200 for valid inputs', async () => {
    const res = await request(app)
      .post('/api/transactions/complete')
      .send({ maintainer, contributor, org_id: 'org-a', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('xdr');
  });
});

describe('POST /api/transactions/revoke', () => {
  it('returns 400 for invalid contributor', async () => {
    const res = await request(app)
      .post('/api/transactions/revoke')
      .send({ maintainer, contributor: 'bad', org_id: 'org-a', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(400);
  });

  it('returns 200 for valid inputs', async () => {
    const res = await request(app)
      .post('/api/transactions/revoke')
      .send({ maintainer, contributor, org_id: 'org-a', issue_id: 1, sequence: SEQ });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('xdr');
  });
});

describe('Rate limiting on /api/transactions', () => {
  it('returns 429 after exceeding wallet rate limit', async () => {
    const wallet = Keypair.random().publicKey();
    // walletLimiter allows 10 per minute per wallet; body.wallet is used as key
    const responses = await Promise.all(
      Array.from({ length: 11 }, () =>
        request(app)
          .post('/api/transactions/apply')
          .send({ contributor: wallet, org_id: 'org-a', issue_id: 1, sequence: SEQ, wallet }),
      ),
    );
    const statuses = responses.map((r) => r.status);
    expect(statuses).toContain(429);
    const tooMany = responses.find((r) => r.status === 429)!;
    expect(tooMany.body).toHaveProperty('error');
    expect(tooMany.body).toHaveProperty('retryAfter');
  });
});
