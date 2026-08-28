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

// ---------------------------------------------------------------------------
// GET /api/transactions/estimate-fee
// ---------------------------------------------------------------------------

// Mock the Redis cache module so tests run without a live Redis instance.
// getCached returns null by default (cache miss); individual tests can override.
jest.mock('../../src/services/redis', () => ({
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(undefined),
  invalidateCache: jest.fn().mockResolvedValue(undefined),
}));

// Re-import after mock registration so the spies are accessible.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const redisMock = require('../../src/services/redis') as {
  getCache: jest.MockedFunction<(key: string) => Promise<unknown>>;
  setCache: jest.MockedFunction<(key: string, value: unknown, ttl: number) => Promise<void>>;
};

// The simulate spy was set up at the top of this file; reuse it here.
// We re-assign its resolved value per test where needed.
const simulateSpy = jest.spyOn(SorobanService.prototype, 'simulate');

/**
 * Simulate response for 50 000 stroops resource fee.
 * Base fee is always 100 stroops.
 * 20% cushion → 50 000 * 1.2 = 60 000 stroops
 * base_fee_xlm     = "0.00001"     (100 / 10_000_000)
 * resource_fee_xlm = "0.006"       (60 000 / 10_000_000)
 * total_fee_xlm    = "0.006001"    ((100 + 60 000) / 10_000_000)
 */
const MOCK_ESTIMATE = {
  fee: '50000',
  instructions: 500000,
  readBytes: 2000,
  writeBytes: 1000,
};

describe('GET /api/transactions/estimate-fee', () => {
  beforeEach(() => {
    // Default: cache miss so simulate is always called unless overridden
    redisMock.getCache.mockResolvedValue(null);
    redisMock.setCache.mockResolvedValue(undefined);
    simulateSpy.mockResolvedValue(MOCK_ESTIMATE);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── Acceptance criterion: returns fee breakdown for all 5 functions ──────

  const SUPPORTED = [
    'apply_for_issue',
    'withdraw_application',
    'assign_issue',
    'complete_assignment',
    'revoke_assignment',
  ] as const;

  for (const fnName of SUPPORTED) {
    it(`returns 200 fee breakdown for ${fnName}`, async () => {
      const res = await request(app)
        .get(`/api/transactions/estimate-fee?function=${fnName}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        base_fee_xlm: expect.stringMatching(/^\d+\.\d+$/),
        resource_fee_xlm: expect.stringMatching(/^\d+\.\d+$/),
        total_fee_xlm: expect.stringMatching(/^\d+\.\d+$/),
        fee_cushion_pct: 20,
      });
    });
  }

  // ── Acceptance criterion: 20% cushion applied to resource_fee ────────────

  it('applies 20% cushion to resource_fee_xlm', async () => {
    const res = await request(app)
      .get('/api/transactions/estimate-fee?function=apply_for_issue');

    expect(res.status).toBe(200);

    // resource fee: 50 000 stroops → cushioned: 60 000 → 0.006 XLM
    expect(res.body.resource_fee_xlm).toBe('0.006');
  });

  it('computes correct base_fee_xlm and total_fee_xlm', async () => {
    const res = await request(app)
      .get('/api/transactions/estimate-fee?function=apply_for_issue');

    expect(res.status).toBe(200);
    // base = 100 stroops = 0.00001 XLM
    expect(res.body.base_fee_xlm).toBe('0.00001');
    // total = 100 + 60 000 = 60 100 stroops = 0.006010 XLM → "0.00601"
    expect(res.body.total_fee_xlm).toBe('0.00601');
  });

  // ── Acceptance criterion: unknown function returns 400 ───────────────────

  it('returns 400 for an unknown function name', async () => {
    const res = await request(app)
      .get('/api/transactions/estimate-fee?function=transfer_tokens');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid function name/i);
    expect(res.body.supported).toEqual(SUPPORTED);
  });

  it('returns 400 when the function query param is missing', async () => {
    const res = await request(app).get('/api/transactions/estimate-fee');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid function name/i);
  });

  it('returns 400 for an empty function string', async () => {
    const res = await request(app)
      .get('/api/transactions/estimate-fee?function=');

    expect(res.status).toBe(400);
  });

  // ── Acceptance criterion: cached estimate served within 10 seconds ───────

  it('returns cached estimate without calling simulate again', async () => {
    const cachedPayload = {
      base_fee_xlm: '0.00001',
      resource_fee_xlm: '0.006',
      total_fee_xlm: '0.00601',
      fee_cushion_pct: 20,
    };
    redisMock.getCache.mockResolvedValueOnce(cachedPayload);

    const res = await request(app)
      .get('/api/transactions/estimate-fee?function=apply_for_issue');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(cachedPayload);
    // simulate should NOT have been called — cache hit served the response
    expect(simulateSpy).not.toHaveBeenCalled();
  });

  it('stores estimate in cache with 10-second TTL on cache miss', async () => {
    const res = await request(app)
      .get('/api/transactions/estimate-fee?function=apply_for_issue');

    expect(res.status).toBe(200);
    expect(redisMock.setCache).toHaveBeenCalledWith(
      'fee_estimate:apply_for_issue',
      expect.objectContaining({ fee_cushion_pct: 20 }),
      10,
    );
  });

  // ── Acceptance criterion: unit test mocks simulateTransaction response ───

  it('uses simulateTransaction mock to derive fee values', async () => {
    // Override with a different fee to confirm mock is wired correctly
    simulateSpy.mockResolvedValueOnce({
      fee: '100000', // 100 000 stroops
      instructions: 1000000,
      readBytes: 4000,
      writeBytes: 2000,
    });

    const res = await request(app)
      .get('/api/transactions/estimate-fee?function=withdraw_application');

    expect(res.status).toBe(200);
    // 100 000 * 1.2 = 120 000 stroops = 0.012 XLM
    expect(res.body.resource_fee_xlm).toBe('0.012');
    // total = 100 + 120 000 = 120 100 stroops = 0.0120100 → "0.01201"
    expect(res.body.total_fee_xlm).toBe('0.01201');
    expect(simulateSpy).toHaveBeenCalled();
  });

  it('returns 500 when simulation throws', async () => {
    simulateSpy.mockRejectedValueOnce(new Error('RPC timeout'));

    const res = await request(app)
      .get('/api/transactions/estimate-fee?function=assign_issue');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/RPC timeout/i);
  });
});
