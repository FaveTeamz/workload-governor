import { Address, Keypair, xdr } from '@stellar/stellar-sdk';
import { EventValidationError, validateContractEvent } from '../../src/contractEventSchema';
import { ContractEventRecord, EventIndexer } from '../../src/eventIndexer';
import { pool } from '../../src/db';
import { publishLiveEvent } from '../../src/services/event-bus';

// Exercise real XDR encoding and decoding instead of the repository's SDK stub.
jest.mock('@stellar/stellar-sdk', () =>
  jest.requireActual('../../node_modules/@stellar/stellar-sdk/lib/index.js'));
jest.mock('../../src/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../../src/services/redis', () => ({ getCache: jest.fn(), setCache: jest.fn() }));
jest.mock('../../src/services/event-bus', () => ({ publishLiveEvent: jest.fn() }));
jest.mock('../../src/logger', () => ({ logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() } }));

const actor = Keypair.random().publicKey();
const address = new Address(actor).toScVal();
const symbol = (value: string) => xdr.ScVal.scvSymbol(value);
const uint = (value: number) => xdr.ScVal.scvU32(value);
const org = symbol('stellar');

function event(name = 'applied', data = [org, uint(42)]) {
  return {
    type: 'contract', id: '100-1-2', pagingToken: '100-1-2', ledger: 100,
    ledgerClosedAt: '2026-10-24T00:00:00Z', txHash: 'tx-hash',
    topic: [symbol('WG'), symbol(name), address], value: xdr.ScVal.scvVec(data),
  };
}

type InternalIndexer = {
  parseRpcEvent: (raw: unknown) => Promise<ContractEventRecord | null>;
  pollForEvents: () => Promise<void>;
  isRunning: boolean;
  server: { getEvents: jest.Mock };
  cursor?: string;
};

describe('Contract event ABI validation (#1030)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 1 } as never);
  });

  const layouts: Array<[string, xdr.ScVal[]]> = [
    ['applied', [org, uint(42)]], ['withdrew', [org, uint(42)]],
    ['assigned', [address, org, uint(42)]], ['completed', [address, org, uint(42)]],
    ['revoked', [address, org, uint(42)]], ['maint_reg', [address, org]],
    ['init', [address, uint(100)]], ['maint_dreg', [address, org]],
    ['mig_done', [uint(3)]], ['ms_set', [uint(2), uint(3)]],
    ['cap_prop', [uint(1), uint(5)]], ['cap_vote', [uint(1), xdr.ScVal.scvBool(true)]],
    ['cap_exec', [uint(1), uint(5)]], ['adm_act', [uint(1)]],
  ];

  it.each(layouts)('accepts the exact %s ABI tuple', (name, data) => {
    const raw = event(name, data);
    expect(validateContractEvent(raw.topic, raw.value)).toMatchObject({ name, entity: actor });
    expect(() => validateContractEvent(raw.topic, xdr.ScVal.scvVec([...data, uint(0)])))
      .toThrow(EventValidationError);
    expect(() => validateContractEvent(raw.topic, xdr.ScVal.scvVec(data.slice(1))))
      .toThrow(EventValidationError);
    for (let index = 0; index < data.length; index++) {
      const wrong = [...data];
      wrong[index] = xdr.ScVal.scvVoid();
      expect(() => validateContractEvent(raw.topic, xdr.ScVal.scvVec(wrong)))
        .toThrow(`data[${index}]`);
    }
  });

  it.each(['sdk', 'base64', 'wrapper'])('parses %s RPC representations', async (format) => {
    const raw = event();
    const encode = (value: xdr.ScVal) => format === 'sdk' ? value
      : format === 'base64' ? value.toXDR('base64') : { xdr: value.toXDR('base64') };
    const indexer = new EventIndexer() as unknown as InternalIndexer;
    expect(await indexer.parseRpcEvent({ ...raw, topic: raw.topic.map(encode), value: encode(raw.value) }))
      .toEqual({ event_type: 'applied', contributor: actor, org_id: 'stellar', issue_id: 42,
        tx_hash: 'tx-hash', event_index: 2, ledger: 100, timestamp: new Date(raw.ledgerClosedAt) });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it.each(layouts.slice(0, 6))('projects %s fields only after validation', async (name, data) => {
    const indexer = new EventIndexer() as unknown as InternalIndexer;
    expect(await indexer.parseRpcEvent(event(name, data))).toMatchObject({
      event_type: name, contributor: name === 'maint_reg' ? null : actor,
      org_id: 'stellar', issue_id: name === 'maint_reg' ? null : 42,
    });
  });

  it('accepts the full unsigned u32 range', () => {
    expect(validateContractEvent(event().topic, xdr.ScVal.scvVec([org, uint(4294967295)])).data)
      .toEqual(['stellar', 4294967295]);
  });

  it.each([
    ['missing topics', { topic: undefined }],
    ['short topics', { topic: [symbol('WG'), symbol('applied')] }],
    ['extra topics', { topic: [...event().topic, org] }],
    ['wrong namespace', { topic: [symbol('OTHER'), symbol('applied'), address] }],
    ['string namespace', { topic: [xdr.ScVal.scvString('WG'), symbol('applied'), address] }],
    ['unknown event', { topic: [symbol('WG'), symbol('new_event'), address] }],
    ['string event name', { topic: [symbol('WG'), xdr.ScVal.scvString('applied'), address] }],
    ['string address', { topic: [symbol('WG'), symbol('applied'), xdr.ScVal.scvString(actor)] }],
    ['broken topic XDR', { topic: ['not xdr', symbol('applied'), address] }],
    ['missing value', { value: undefined }],
    ['broken data XDR', { value: { xdr: 'not xdr' } }],
    ['non-tuple data', { value: org }],
    ['null tuple', { value: xdr.ScVal.scvVec(null) }],
    ['string org', { value: xdr.ScVal.scvVec([xdr.ScVal.scvString('stellar'), uint(42)]) }],
    ['invalid org symbol', { value: xdr.ScVal.scvVec([symbol('bad-org'), uint(42)]) }],
    ['overlong org symbol', { value: xdr.ScVal.scvVec([symbol('a'.repeat(33)), uint(42)]) }],
    ['signed issue', { value: xdr.ScVal.scvVec([org, xdr.ScVal.scvI32(-1)]) }],
    ['invalid time', { ledgerClosedAt: 'invalid' }],
    ['invalid ledger', { ledger: '100bad' }],
    ['invalid index', { id: '100-1-bad' }],
    ['invalid transaction', { txHash: '' }],
  ])('quarantines %s with raw payload and reason', async (_name, overrides) => {
    const raw = { ...event(), ...overrides };
    const indexer = new EventIndexer() as unknown as InternalIndexer;
    expect(await indexer.parseRpcEvent(raw)).toBeNull();
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO indexer_quarantine'),
      [expect.any(String), raw.id, expect.any(String), expect.any(String)]);
    const params = jest.mocked(pool.query).mock.calls[0][1] as unknown as unknown[];
    expect(JSON.parse(params[2] as string)).toEqual(JSON.parse(JSON.stringify(raw)));
    expect(params[3]).not.toBe('');
    expect(publishLiveEvent).not.toHaveBeenCalled();
  });

  it('retains legacy timestamp and ledger representations', async () => {
    const raw = event();
    const indexer = new EventIndexer() as unknown as InternalIndexer;
    expect(await indexer.parseRpcEvent({ ...raw, ledger: '100', ledgerClosedAt: undefined,
      createdAt: raw.ledgerClosedAt })).toMatchObject({ ledger: 100, timestamp: new Date(raw.ledgerClosedAt) });
  });

  it('ignores system events and valid events outside the indexer projection', async () => {
    const indexer = new EventIndexer() as unknown as InternalIndexer;
    expect(await indexer.parseRpcEvent({ type: 'system' })).toBeNull();
    expect(await indexer.parseRpcEvent(event('init', [address, uint(100)]))).toBeNull();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('propagates quarantine database failures for retry', async () => {
    jest.mocked(pool.query).mockRejectedValueOnce(new Error('database unavailable') as never);
    const indexer = new EventIndexer() as unknown as InternalIndexer;
    await expect(indexer.parseRpcEvent({ ...event(), value: undefined }))
      .rejects.toThrow('database unavailable');
  });

  it('keeps the cursor and checkpoint unchanged when quarantine persistence fails', async () => {
    jest.useFakeTimers();
    try {
      const indexer = new EventIndexer();
      const internal = indexer as unknown as InternalIndexer;
      const checkpoint = jest.spyOn(indexer, 'commitCheckpointTransaction').mockResolvedValue();
      internal.cursor = 'previous-cursor';
      internal.server.getEvents = jest.fn().mockResolvedValue({ events: [{ ...event(), value: org }] });
      internal.isRunning = true;
      jest.mocked(pool.query).mockRejectedValueOnce(new Error('database unavailable') as never);
      const { logger } = jest.requireMock('../../src/logger');
      logger.error.mockImplementation(() => { internal.isRunning = false; });
      const polling = internal.pollForEvents();
      await jest.advanceTimersByTimeAsync(10000);
      await polling;
      expect(internal.cursor).toBe('previous-cursor');
      expect(checkpoint).not.toHaveBeenCalled();
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(publishLiveEvent).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('processes a valid event after quarantining a bad event and advances the cursor', async () => {
    jest.useFakeTimers();
    try {
      const indexer = new EventIndexer();
      const internal = indexer as unknown as InternalIndexer;
      jest.spyOn(indexer, 'commitCheckpointTransaction').mockResolvedValue();
      const good = { ...event(), id: '100-1-3', pagingToken: '100-1-3' };
      internal.server.getEvents = jest.fn().mockResolvedValue({ events: [{ ...event(), value: org }, good] });
      internal.isRunning = true;
      const polling = internal.pollForEvents();
      // Stop at the end-of-batch log, after both writes and before sleeping.
      const { logger } = jest.requireMock('../../src/logger');
      logger.info.mockImplementation(() => { internal.isRunning = false; });
      await jest.advanceTimersByTimeAsync(5000);
      await polling;
      expect(pool.query).toHaveBeenNthCalledWith(1, expect.stringContaining('INSERT INTO indexer_quarantine'), expect.any(Array));
      expect(pool.query).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO contract_events'),
        ['applied', actor, 'stellar', 42, 'tx-hash', 3, 100, new Date(good.ledgerClosedAt)]);
      expect(internal.cursor).toBe(good.pagingToken);
      expect(publishLiveEvent).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
