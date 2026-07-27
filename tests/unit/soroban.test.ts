import { SorobanRpc, Keypair } from '@stellar/stellar-sdk';
import { SorobanService } from '../../src/soroban';

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

describe('SorobanService', () => {
  let service: SorobanService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SorobanService();
  });

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
});
