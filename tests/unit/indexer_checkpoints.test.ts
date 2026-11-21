/**
 * tests/unit/indexer_checkpoints.test.ts
 *
 * Unit tests for indexer checkpoint persistence (#849).
 * Verifies that:
 *  - saveCheckpoint and getCheckpoint persist and query indexer_checkpoints
 *  - commitCheckpointTransaction executes transactional BEGIN/COMMIT and updates Redis cache
 *  - initCursor recovers from Redis cache, or falls back to database checkpoint table
 *  - migration 3_indexer_checkpoints.js defines correct table schema and indices
 */

import { saveCheckpoint, getCheckpoint, IndexerCheckpoint } from '../../src/db';

const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockConnect = jest.fn();
const mockGetCache = jest.fn();
const mockSetCache = jest.fn();

jest.mock('../../src/services/redis', () => ({
  getCache: (...args: unknown[]) => mockGetCache(...args),
  setCache: (...args: unknown[]) => mockSetCache(...args),
}));

jest.mock('../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('pg', () => {
  return {
    Pool: jest.fn(() => ({
      query: (...args: unknown[]) => mockQuery(...args),
      connect: () => mockConnect(),
      end: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    })),
  };
});

describe('Indexer Checkpoint Persistence (#849)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    mockConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    });
  });

  describe('src/db checkpoint functions', () => {
    it('saveCheckpoint inserts or updates indexer_checkpoints', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await saveCheckpoint('C_CONTRACT_1', 1234, '0xhash1');

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('INSERT INTO indexer_checkpoints');
      expect(sql).toContain('ON CONFLICT (contract_id)');
      expect(params).toEqual(['C_CONTRACT_1', 1234, '0xhash1']);
    });

    it('saveCheckpoint accepts a custom client/transaction runner', async () => {
      const customClient = {
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
      };

      await saveCheckpoint('C_CONTRACT_2', 5678, null, customClient as unknown as import('pg').PoolClient);

      expect(customClient.query).toHaveBeenCalledTimes(1);
      const [sql, params] = customClient.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('INSERT INTO indexer_checkpoints');
      expect(params).toEqual(['C_CONTRACT_2', 5678, null]);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('getCheckpoint returns checkpoint record when found', async () => {
      const mockRecord: IndexerCheckpoint = {
        contract_id: 'C_CONTRACT_1',
        last_ledger: 999,
        last_ledger_hash: '0xhash999',
        updated_at: new Date('2026-09-26T00:00:00Z'),
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockRecord], rowCount: 1 });

      const result = await getCheckpoint('C_CONTRACT_1');

      expect(result).toEqual(mockRecord);
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('FROM indexer_checkpoints WHERE contract_id = $1');
      expect(params).toEqual(['C_CONTRACT_1']);
    });

    it('getCheckpoint returns null when record is not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getCheckpoint('UNKNOWN_CONTRACT');

      expect(result).toBeNull();
    });
  });

  describe('EventIndexer checkpoint and cursor recovery', () => {
    it('commitCheckpointTransaction executes within transaction and updates cache', async () => {
      const { EventIndexer } = await import('../../src/eventIndexer');
      const indexer = new EventIndexer();

      await indexer.commitCheckpointTransaction(1050, 'txhash1050');

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO indexer_checkpoints'),
        expect.any(Array),
      );
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      expect(mockClientRelease).toHaveBeenCalledTimes(1);
      expect(mockSetCache).toHaveBeenCalledWith(
        expect.stringContaining('indexer:checkpoint:'),
        1050,
        3600,
      );
    });

    it('commitCheckpointTransaction rolls back transaction on error', async () => {
      const { EventIndexer } = await import('../../src/eventIndexer');
      const indexer = new EventIndexer();

      mockClientQuery.mockImplementation(async (sql: string) => {
        if (sql === 'BEGIN') return { rows: [] };
        if (typeof sql === 'string' && sql.includes('INSERT INTO indexer_checkpoints')) {
          throw new Error('Database write failed');
        }
        return { rows: [] };
      });

      await indexer.commitCheckpointTransaction(1050, 'txhash1050');

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClientRelease).toHaveBeenCalledTimes(1);
    });

    it('initCursor resumes from Redis cache if available', async () => {
      mockGetCache.mockResolvedValueOnce(2048);

      const { EventIndexer } = await import('../../src/eventIndexer');
      const indexer = new EventIndexer();
      const internalIndexer = indexer as unknown as {
        initCursor: () => Promise<void>;
        cursor?: string;
      };
      await internalIndexer.initCursor();

      expect(internalIndexer.cursor).toBe('2048');
    });

    it('initCursor resumes from database checkpoint table if Redis cache is empty', async () => {
      mockGetCache.mockResolvedValueOnce(null);
      // DB checkpoint query returns ledger 1500
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            contract_id: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
            last_ledger: 1500,
            last_ledger_hash: '0xhash1500',
            updated_at: new Date(),
          },
        ],
        rowCount: 1,
      });

      const { EventIndexer } = await import('../../src/eventIndexer');
      const indexer = new EventIndexer();
      const internalIndexer = indexer as unknown as {
        initCursor: () => Promise<void>;
        cursor?: string;
      };
      await internalIndexer.initCursor();

      expect(internalIndexer.cursor).toBe('1500');
    });

    it('initCursor falls back to contract_events MAX(ledger_seq) if DB checkpoint empty', async () => {
      mockGetCache.mockResolvedValueOnce(null);
      // DB checkpoint query empty
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // MAX(ledger_seq) query returns 850
      mockQuery.mockResolvedValueOnce({
        rows: [{ max_ledger: '850' }],
        rowCount: 1,
      });

      const { EventIndexer } = await import('../../src/eventIndexer');
      const indexer = new EventIndexer();
      const internalIndexer = indexer as unknown as {
        initCursor: () => Promise<void>;
        cursor?: string;
      };
      await internalIndexer.initCursor();

      expect(internalIndexer.cursor).toBe('850');
    });
  });

  describe('Migration 3_indexer_checkpoints', () => {
    it('creates table with required columns and index', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const migration = require('../../migrations/3_indexer_checkpoints');

      const mockPgm = {
        createTable: jest.fn(),
        createIndex: jest.fn(),
        dropTable: jest.fn(),
        dropIndex: jest.fn(),
        func: jest.fn((val: string) => val),
      };

      migration.up(mockPgm);

      expect(mockPgm.createTable).toHaveBeenCalledWith(
        'indexer_checkpoints',
        expect.objectContaining({
          contract_id: expect.objectContaining({ type: 'text', primaryKey: true, notNull: true }),
          last_ledger: expect.objectContaining({ type: 'integer', notNull: true }),
          last_ledger_hash: expect.objectContaining({ type: 'text', notNull: false }),
          updated_at: expect.objectContaining({ type: 'timestamptz', notNull: true }),
        }),
      );

      expect(mockPgm.createIndex).toHaveBeenCalledWith(
        'indexer_checkpoints',
        'last_ledger',
        expect.objectContaining({ name: 'idx_indexer_checkpoints_last_ledger' }),
      );

      migration.down(mockPgm);

      expect(mockPgm.dropIndex).toHaveBeenCalledWith(
        'indexer_checkpoints',
        'last_ledger',
        expect.objectContaining({ name: 'idx_indexer_checkpoints_last_ledger', ifExists: true }),
      );
      expect(mockPgm.dropTable).toHaveBeenCalledWith(
        'indexer_checkpoints',
        expect.objectContaining({ ifExists: true }),
      );
    });
  });
});
