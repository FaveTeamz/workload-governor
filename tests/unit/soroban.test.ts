import { SorobanRpc, Keypair } from '@stellar/stellar-sdk';
import { SorobanService, SorobanRpcError, SorobanParseError } from '../../src/soroban';

const mockSimulate = jest.fn();
const mockSend = jest.fn();
const mockGetTx = jest.fn();
const mockGetData = jest.fn();

jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...actual,
    SorobanRpc: {
      ...actual.SorobanRpc,
      Server: jest.fn().mockImplementation(() => ({
        simulateTransaction: mockSimulate,
        sendTransaction: mockSend,
        getTransaction: mockGetTx,
        getContractData: mockGetData,
      })),
    },
  };
});

const CONTRIBUTOR = Keypair.random().publicKey();
const MAINTAINER = Keypair.random().publicKey();
const ORG = 'org-a';
const ISSUE = 1;
const SEQ = '100';

// ─── Helpers for building mock simulate responses ────────────────────────────

/**
 * Build a successful SimulateTransactionResponse wrapping a native JS value
 * as it would come from scValToNative after a real RPC call.
 *
 * We mock scValToNative's output directly — the mock returns the raw retval
 * object and we instruct the test's spy to return the desired native value.
 */
function makeSuccessResponse(retval: unknown) {
  return {
    minResourceFee: '50000',
    transactionData: {
      build: jest.fn().mockReturnValue({
        resources: () => ({
          instructions: () => 100000,
          readBytes: () => 500,
          writeBytes: () => 0,
        }),
      }),
    },
    result: {
      // retval is an xdr.ScVal — we store the native value here and the spy
      // on scValToNative will return it directly.
      retval,
    },
  };
}

describe('SorobanService', () => {
  let service: SorobanService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SorobanService();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Existing tests (preserved from original test file)
  // ──────────────────────────────────────────────────────────────────────────

  describe('transaction builders', () => {
    it('buildApplyTx returns a Transaction', () => {
      const tx = service.buildApplyTx(CONTRIBUTOR, ORG, ISSUE, SEQ);
      expect(tx.toXDR()).toBeTruthy();
    });

    it('buildWithdrawTx returns a Transaction', () => {
      const tx = service.buildWithdrawTx(CONTRIBUTOR, ORG, ISSUE, SEQ);
      expect(tx.toXDR()).toBeTruthy();
    });

    it('buildAssignTx returns a Transaction', () => {
      const tx = service.buildAssignTx(MAINTAINER, CONTRIBUTOR, ORG, ISSUE, SEQ);
      expect(tx.toXDR()).toBeTruthy();
    });

    it('buildCompleteTx returns a Transaction', () => {
      const tx = service.buildCompleteTx(MAINTAINER, CONTRIBUTOR, ORG, ISSUE, SEQ);
      expect(tx.toXDR()).toBeTruthy();
    });

    it('buildRevokeTx returns a Transaction', () => {
      const tx = service.buildRevokeTx(MAINTAINER, CONTRIBUTOR, ORG, ISSUE, SEQ);
      expect(tx.toXDR()).toBeTruthy();
    });

    it('buildRawTransaction returns a Transaction', () => {
      const tx = service.buildRawTransaction(CONTRIBUTOR, SEQ, 'apply_for_issue', []);
      expect(tx.toXDR()).toBeTruthy();
    });
  });

  describe('simulate', () => {
    it('returns resource estimate on success', async () => {
      const txDataBuild = jest.fn().mockReturnValue({
        resources: () => ({
          instructions: () => 500000,
          readBytes: () => 2000,
          writeBytes: () => 1000,
        }),
      });
      mockSimulate.mockResolvedValueOnce({
        minResourceFee: '50000',
        transactionData: { build: txDataBuild },
      });

      const tx = service.buildApplyTx(CONTRIBUTOR, ORG, ISSUE, SEQ);
      const result = await service.simulate(tx);
      expect(result.fee).toBe('50000');
      expect(result.instructions).toBe(500000);
    });

    it('throws on simulation error', async () => {
      mockSimulate.mockResolvedValueOnce({ error: 'Contract error: error code=6' });
      // isSimulationError checks for the 'error' property
      jest.spyOn(SorobanRpc.Api, 'isSimulationError').mockReturnValueOnce(true);

      const tx = service.buildApplyTx(CONTRIBUTOR, ORG, ISSUE, SEQ);
      await expect(service.simulate(tx)).rejects.toThrow('Simulation failed');
    });
  });

  describe('submitTransaction', () => {
    it('returns success on PENDING then SUCCESS poll', async () => {
      mockSend.mockResolvedValueOnce({ hash: 'txhash', status: 'PENDING' });
      mockGetTx.mockResolvedValueOnce({ status: 'SUCCESS' });

      const tx = service.buildApplyTx(CONTRIBUTOR, ORG, ISSUE, SEQ);
      const result = await service.submitTransaction(tx);
      expect(result.hash).toBe('txhash');
      expect(result.status).toBe('success');
    });

    it('returns error on FAILED transaction', async () => {
      mockSend.mockResolvedValueOnce({ hash: 'txhash2', status: 'PENDING' });
      mockGetTx.mockResolvedValueOnce({
        status: 'FAILED',
        resultXdr: 'error code=7',
      });

      const tx = service.buildApplyTx(CONTRIBUTOR, ORG, ISSUE, SEQ);
      const result = await service.submitTransaction(tx);
      expect(result.status).toBe('error');
    });

    it('returns error on thrown exception', async () => {
      mockSend.mockRejectedValueOnce(new Error('network error'));
      const tx = service.buildApplyTx(CONTRIBUTOR, ORG, ISSUE, SEQ);
      const result = await service.submitTransaction(tx);
      expect(result.status).toBe('error');
      expect(result.hash).toBe('');
    });
  });

  describe('getContractData', () => {
    it('returns null on error', async () => {
      mockGetData.mockRejectedValueOnce(new Error('not found'));
      const { nativeToScVal } = jest.requireActual('@stellar/stellar-sdk');
      const key = nativeToScVal('test', { type: 'symbol' });
      const result = await service.getContractData(key);
      expect(result).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // New: read-only contract query function tests (issue #377)
  // ──────────────────────────────────────────────────────────────────────────

  describe('getGlobalApplicationCount', () => {
    /**
     * Test 1: returns correct count from mocked RPC response.
     *
     * The mock simulate returns a retval that scValToNative decodes as 7.
     * We use the actual scValToNative after wrapping the value in nativeToScVal
     * so the round-trip is realistic.
     */
    it('returns correct count from mocked RPC', async () => {
      const { nativeToScVal: real_nativeToScVal } = jest.requireActual('@stellar/stellar-sdk');
      const retvalScVal = real_nativeToScVal(7, { type: 'u32' });
      mockSimulate.mockResolvedValueOnce(makeSuccessResponse(retvalScVal));

      const count = await service.getGlobalApplicationCount(CONTRIBUTOR);
      expect(count).toBe(7);
    });

    it('returns 0 when contributor has no applications', async () => {
      const { nativeToScVal: real_nativeToScVal } = jest.requireActual('@stellar/stellar-sdk');
      const retvalScVal = real_nativeToScVal(0, { type: 'u32' });
      mockSimulate.mockResolvedValueOnce(makeSuccessResponse(retvalScVal));

      const count = await service.getGlobalApplicationCount(CONTRIBUTOR);
      expect(count).toBe(0);
    });

    it('returns cap value (15) correctly', async () => {
      const { nativeToScVal: real_nativeToScVal } = jest.requireActual('@stellar/stellar-sdk');
      const retvalScVal = real_nativeToScVal(15, { type: 'u32' });
      mockSimulate.mockResolvedValueOnce(makeSuccessResponse(retvalScVal));

      const count = await service.getGlobalApplicationCount(CONTRIBUTOR);
      expect(count).toBe(15);
    });

    /**
     * Test 5 (error case): RPC network error throws a typed SorobanRpcError.
     */
    it('throws SorobanRpcError on RPC network failure', async () => {
      mockSimulate.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const error = await service.getGlobalApplicationCount(CONTRIBUTOR).catch((e) => e);
      expect(error).toBeInstanceOf(SorobanRpcError);
      expect(error.name).toBe('SorobanRpcError');
    });

    /**
     * Test 6 (error case): malformed RPC response throws a typed SorobanParseError.
     */
    it('throws SorobanParseError on malformed RPC response (no retval)', async () => {
      // Response is structurally OK (no error field) but missing retval
      mockSimulate.mockResolvedValueOnce({
        minResourceFee: '100',
        transactionData: { build: jest.fn().mockReturnValue({ resources: () => ({}) }) },
        result: { retval: null },
      });

      await expect(service.getGlobalApplicationCount(CONTRIBUTOR))
        .rejects
        .toThrow(SorobanParseError);
    });

    it('throws SorobanRpcError when simulate returns an error result', async () => {
      mockSimulate.mockResolvedValueOnce({ error: 'ContractError(code=9)' });
      jest.spyOn(SorobanRpc.Api, 'isSimulationError').mockReturnValueOnce(true);

      await expect(service.getGlobalApplicationCount(CONTRIBUTOR))
        .rejects
        .toThrow(SorobanRpcError);
    });
  });

  describe('getOrgAssignmentCount', () => {
    /**
     * Test 2: returns correct count from mocked RPC response.
     */
    it('returns correct org assignment count from mocked RPC', async () => {
      const { nativeToScVal: real_nativeToScVal } = jest.requireActual('@stellar/stellar-sdk');
      const retvalScVal = real_nativeToScVal(3, { type: 'u32' });
      mockSimulate.mockResolvedValueOnce(makeSuccessResponse(retvalScVal));

      const count = await service.getOrgAssignmentCount(CONTRIBUTOR, ORG);
      expect(count).toBe(3);
    });

    it('returns 0 when contributor has no assignments in org', async () => {
      const { nativeToScVal: real_nativeToScVal } = jest.requireActual('@stellar/stellar-sdk');
      const retvalScVal = real_nativeToScVal(0, { type: 'u32' });
      mockSimulate.mockResolvedValueOnce(makeSuccessResponse(retvalScVal));

      const count = await service.getOrgAssignmentCount(CONTRIBUTOR, ORG);
      expect(count).toBe(0);
    });

    it('returns org cap value (4) correctly', async () => {
      const { nativeToScVal: real_nativeToScVal } = jest.requireActual('@stellar/stellar-sdk');
      const retvalScVal = real_nativeToScVal(4, { type: 'u32' });
      mockSimulate.mockResolvedValueOnce(makeSuccessResponse(retvalScVal));

      const count = await service.getOrgAssignmentCount(CONTRIBUTOR, ORG);
      expect(count).toBe(4);
    });

    it('throws SorobanRpcError on network error', async () => {
      mockSimulate.mockRejectedValueOnce(new Error('timeout'));

      await expect(service.getOrgAssignmentCount(CONTRIBUTOR, ORG))
        .rejects
        .toThrow(SorobanRpcError);
    });

    it('throws SorobanParseError when retval is missing', async () => {
      mockSimulate.mockResolvedValueOnce({
        minResourceFee: '100',
        transactionData: { build: jest.fn().mockReturnValue({ resources: () => ({}) }) },
        result: { retval: undefined },
      });

      await expect(service.getOrgAssignmentCount(CONTRIBUTOR, ORG))
        .rejects
        .toThrow(SorobanParseError);
    });
  });

  describe('hasApplied', () => {
    /**
     * Test 3a: returns true when contributor has applied.
     */
    it('returns true when contributor has applied for the issue', async () => {
      const { nativeToScVal: real_nativeToScVal } = jest.requireActual('@stellar/stellar-sdk');
      const retvalScVal = real_nativeToScVal(true, { type: 'bool' });
      mockSimulate.mockResolvedValueOnce(makeSuccessResponse(retvalScVal));

      const result = await service.hasApplied(CONTRIBUTOR, ORG, ISSUE);
      expect(result).toBe(true);
    });

    /**
     * Test 3b: returns false when contributor has NOT applied.
     */
    it('returns false when contributor has not applied for the issue', async () => {
      const { nativeToScVal: real_nativeToScVal } = jest.requireActual('@stellar/stellar-sdk');
      const retvalScVal = real_nativeToScVal(false, { type: 'bool' });
      mockSimulate.mockResolvedValueOnce(makeSuccessResponse(retvalScVal));

      const result = await service.hasApplied(CONTRIBUTOR, ORG, ISSUE);
      expect(result).toBe(false);
    });

    it('throws SorobanRpcError on RPC network failure', async () => {
      mockSimulate.mockRejectedValueOnce(new Error('network down'));

      await expect(service.hasApplied(CONTRIBUTOR, ORG, ISSUE))
        .rejects
        .toThrow(SorobanRpcError);
    });

    it('throws SorobanParseError on malformed response (null retval)', async () => {
      mockSimulate.mockResolvedValueOnce({
        minResourceFee: '100',
        transactionData: { build: jest.fn().mockReturnValue({ resources: () => ({}) }) },
        result: {},
      });

      await expect(service.hasApplied(CONTRIBUTOR, ORG, ISSUE))
        .rejects
        .toThrow(SorobanParseError);
    });
  });

  describe('isAssigned', () => {
    /**
     * Test 4a: returns true when contributor is actively assigned.
     */
    it('returns true when contributor is assigned to the issue', async () => {
      const { nativeToScVal: real_nativeToScVal } = jest.requireActual('@stellar/stellar-sdk');
      const retvalScVal = real_nativeToScVal(true, { type: 'bool' });
      mockSimulate.mockResolvedValueOnce(makeSuccessResponse(retvalScVal));

      const result = await service.isAssigned(CONTRIBUTOR, ORG, ISSUE);
      expect(result).toBe(true);
    });

    /**
     * Test 4b: returns false when contributor is NOT assigned.
     */
    it('returns false when contributor is not assigned to the issue', async () => {
      const { nativeToScVal: real_nativeToScVal } = jest.requireActual('@stellar/stellar-sdk');
      const retvalScVal = real_nativeToScVal(false, { type: 'bool' });
      mockSimulate.mockResolvedValueOnce(makeSuccessResponse(retvalScVal));

      const result = await service.isAssigned(CONTRIBUTOR, ORG, ISSUE);
      expect(result).toBe(false);
    });

    it('throws SorobanRpcError on RPC network failure', async () => {
      mockSimulate.mockRejectedValueOnce(new Error('socket hang up'));

      await expect(service.isAssigned(CONTRIBUTOR, ORG, ISSUE))
        .rejects
        .toThrow(SorobanRpcError);
    });

    it('throws SorobanParseError on malformed response (no result object)', async () => {
      mockSimulate.mockResolvedValueOnce({
        minResourceFee: '100',
        transactionData: { build: jest.fn().mockReturnValue({ resources: () => ({}) }) },
        // result is missing entirely
      });

      await expect(service.isAssigned(CONTRIBUTOR, ORG, ISSUE))
        .rejects
        .toThrow(SorobanParseError);
    });

    it('throws SorobanParseError when retval decodes to unexpected type', async () => {
      // Return a u32 where a bool is expected
      const { nativeToScVal: real_nativeToScVal } = jest.requireActual('@stellar/stellar-sdk');
      // Deliberately pass something that will decode as a number, not a bool
      const retvalScVal = real_nativeToScVal(1, { type: 'u32' });
      mockSimulate.mockResolvedValueOnce(makeSuccessResponse(retvalScVal));

      await expect(service.isAssigned(CONTRIBUTOR, ORG, ISSUE))
        .rejects
        .toThrow(SorobanParseError);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Cross-cutting: verify SorobanRpcError and SorobanParseError error class names
  // ──────────────────────────────────────────────────────────────────────────

  describe('typed error classes', () => {
    it('SorobanRpcError has correct name and message', () => {
      const err = new SorobanRpcError('test rpc error', new Error('cause'));
      expect(err.name).toBe('SorobanRpcError');
      expect(err.message).toBe('test rpc error');
      expect(err.cause).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(Error);
    });

    it('SorobanParseError has correct name and raw payload', () => {
      const raw = { some: 'data' };
      const err = new SorobanParseError('failed to parse', raw);
      expect(err.name).toBe('SorobanParseError');
      expect(err.message).toBe('failed to parse');
      expect(err.raw).toEqual(raw);
      expect(err).toBeInstanceOf(Error);
    });
  });
});
