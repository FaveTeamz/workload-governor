import { HorizonService } from '../../src/horizon';
import { Horizon, NotFoundError } from '@stellar/stellar-sdk';

// We'll spy on the Horizon.Server prototype methods
const mockAccountCall = jest.fn();
const mockTxCall = jest.fn();
const mockStream = jest.fn();

jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: jest.fn().mockImplementation(() => ({
        accounts: () => ({
          accountId: () => ({ call: mockAccountCall }),
        }),
        transactions: () => ({
          forAccount: () => ({
            limit: () => ({
              order: () => ({ call: mockTxCall }),
            }),
            stream: mockStream,
          }),
        }),
      })),
    },
  };
});

const ACCOUNT_ID = 'GABC123';

const MOCK_ACCOUNT = {
  id: ACCOUNT_ID,
  sequence: '12345',
  subentry_count: 2,
  balances: [
    { balance: '100.0', asset_type: 'native' },
    { balance: '50.0', asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'GISSUER' },
  ],
};

const MOCK_TX = {
  id: 'tx1',
  hash: 'abc',
  ledger_attr: 100,
  created_at: '2024-01-01T00:00:00Z',
  fee_charged: '100',
  operation_count: 1,
};

describe('HorizonService', () => {
  let service: HorizonService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HorizonService('https://horizon-testnet.stellar.org', {
      maxRetries: 2,
      initialDelayMs: 1,
    });
  });

  describe('fetchAccount', () => {
    it('returns mapped account data on success', async () => {
      mockAccountCall.mockResolvedValueOnce(MOCK_ACCOUNT);
      const result = await service.fetchAccount(ACCOUNT_ID);
      expect(result.id).toBe(ACCOUNT_ID);
      expect(result.sequence).toBe('12345');
      expect(result.subentryCount).toBe(2);
      expect(result.balances).toHaveLength(2);
      expect(result.balances[1].asset_code).toBe('USDC');
    });

    it('throws "Account not found" on NotFoundError', async () => {
      mockAccountCall.mockRejectedValueOnce(new NotFoundError({} as never, undefined as never));
      await expect(service.fetchAccount('GNONE')).rejects.toThrow('Account not found: GNONE');
    });

    it('retries on 429 and succeeds', async () => {
      const rateLimitErr = Object.assign(new Error('rate limit'), { response: { status: 429 } });
      mockAccountCall
        .mockRejectedValueOnce(rateLimitErr)
        .mockResolvedValueOnce(MOCK_ACCOUNT);
      const result = await service.fetchAccount(ACCOUNT_ID);
      expect(result.id).toBe(ACCOUNT_ID);
      expect(mockAccountCall).toHaveBeenCalledTimes(2);
    });

    it('throws non-retryable errors immediately', async () => {
      const err = Object.assign(new Error('forbidden'), { response: { status: 403 } });
      mockAccountCall.mockRejectedValueOnce(err);
      await expect(service.fetchAccount(ACCOUNT_ID)).rejects.toThrow('forbidden');
      expect(mockAccountCall).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchTransactionHistory', () => {
    it('returns mapped transaction data', async () => {
      mockTxCall.mockResolvedValueOnce({ records: [MOCK_TX] });
      const result = await service.fetchTransactionHistory(ACCOUNT_ID);
      expect(result).toHaveLength(1);
      expect(result[0].hash).toBe('abc');
      expect(result[0].fee_charged).toBe(100);
    });

    it('retries on 503 and eventually throws', async () => {
      const err = Object.assign(new Error('unavailable'), { response: { status: 503 } });
      mockTxCall.mockRejectedValue(err);
      await expect(service.fetchTransactionHistory(ACCOUNT_ID)).rejects.toThrow('unavailable');
      expect(mockTxCall).toHaveBeenCalledTimes(2); // maxRetries=2
    });
  });

  describe('streamEvents', () => {
    it('calls server.transactions().forAccount().stream()', () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      service.streamEvents(ACCOUNT_ID, onUpdate, onError);
      expect(mockStream).toHaveBeenCalledWith({
        onmessage: onUpdate,
        onerror: onError,
      });
    });
  });
});
