/**
 * tests/unit/indexer-reorg.test.ts
 *
 * Unit tests for Horizon ledger reorganization and fork rollback handling (#1022).
 *
 * Acceptance Criteria verified:
 *  - Implement ledger continuity checks comparing parent hash of current ledger
 *    with previous checkpoint hash.
 *  - Rewind checkpoint state to last confirmed common ancestor on detected reorg.
 */

import { EventIndexer, LedgerHeaderInfo } from '../../src/eventIndexer';

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

jest.mock('pg', () => ({
  Pool: jest.fn(() => ({
    query: (...args: unknown[]) => mockQuery(...args),
    connect: () => mockConnect(),
    end: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  })),
}));

describe('EventIndexer — Horizon Ledger Reorg & Rollback Handling (#1022)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    mockConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    });
  });

  describe('verifyLedgerContinuity', () => {
    it('returns true when parent hash of current ledger matches previous checkpoint hash', () => {
      const indexer = new EventIndexer();
      indexer.recordLedgerHash(100, '0xhash_100');

      const nextLedger: LedgerHeaderInfo = {
        sequence: 101,
        hash: '0xhash_101',
        prevHash: '0xhash_100',
      };

      expect(indexer.verifyLedgerContinuity(nextLedger)).toBe(true);
    });

    it('returns false when parent hash of current ledger mismatches previous checkpoint hash', () => {
      const indexer = new EventIndexer();
      indexer.recordLedgerHash(100, '0xhash_100');

      const forkedNextLedger: LedgerHeaderInfo = {
        sequence: 101,
        hash: '0xfork_101',
        prevHash: '0xfork_100_different',
      };

      expect(indexer.verifyLedgerContinuity(forkedNextLedger)).toBe(false);
    });

    it('returns false when Horizon reports a rollback to an earlier ledger sequence', () => {
      const indexer = new EventIndexer();
      indexer.recordLedgerHash(100, '0xhash_100');
      indexer.recordLedgerHash(101, '0xhash_101');
      indexer.recordLedgerHash(102, '0xhash_102');

      const rolledBackLedger: LedgerHeaderInfo = {
        sequence: 101,
        hash: '0xfork_101',
        prevHash: '0xhash_100',
      };

      expect(indexer.verifyLedgerContinuity(rolledBackLedger)).toBe(false);
    });

    it('returns false when same ledger sequence reports a divergent hash', () => {
      const indexer = new EventIndexer();
      indexer.recordLedgerHash(500, '0xcanonical_500');

      const divergentSameLedger: LedgerHeaderInfo = {
        sequence: 500,
        hash: '0xdivergent_500',
        prevHash: '0xcanonical_499',
      };

      expect(indexer.verifyLedgerContinuity(divergentSameLedger)).toBe(false);
    });
  });

  describe('findCommonAncestor & rewindToAncestor', () => {
    it('walks backward across a multi-ledger fork to locate the last confirmed common ancestor', async () => {
      // Canonical chain shares ledgers 100 and 101, then diverges at 102 and 103
      const canonicalChain: Record<number, LedgerHeaderInfo> = {
        100: { sequence: 100, hash: '0xcommon_100', prevHash: '0xcommon_99' },
        101: { sequence: 101, hash: '0xcommon_101', prevHash: '0xcommon_100' },
        102: { sequence: 102, hash: '0xcanonical_102', prevHash: '0xcommon_101' },
        103: { sequence: 103, hash: '0xcanonical_103', prevHash: '0xcanonical_102' },
      };

      const indexer = new EventIndexer(async (seq) => canonicalChain[seq] ?? null);

      // Local indexer had ingested orphaned fork at 102 and 103
      indexer.recordLedgerHash(100, '0xcommon_100');
      indexer.recordLedgerHash(101, '0xcommon_101');
      indexer.recordLedgerHash(102, '0xorphaned_102');
      indexer.recordLedgerHash(103, '0xorphaned_103');

      const ancestor = await indexer.findCommonAncestor(103);
      expect(ancestor).toEqual({
        sequence: 101,
        hash: '0xcommon_101',
      });
    });

    it('rewinds checkpoint state and deletes orphaned events when a reorg is detected', async () => {
      const canonicalChain: Record<number, LedgerHeaderInfo> = {
        200: { sequence: 200, hash: '0xhash_200', prevHash: '0xhash_199' },
        201: { sequence: 201, hash: '0xhash_201_new', prevHash: '0xhash_200' },
        202: { sequence: 202, hash: '0xhash_202_new', prevHash: '0xhash_201_new' },
      };

      const indexer = new EventIndexer(async (seq) => canonicalChain[seq] ?? null);

      // Local state has confirmed 200, plus orphaned 201_old
      indexer.recordLedgerHash(200, '0xhash_200');
      indexer.recordLedgerHash(201, '0xhash_201_old');

      // Incoming ledger 202 references parent 0xhash_201_new != 0xhash_201_old
      const outcome = await indexer.handleLedgerContinuity({
        sequence: 202,
        hash: '0xhash_202_new',
        prevHash: '0xhash_201_new',
      });

      expect(outcome).toEqual({
        reorgDetected: true,
        rewoundToLedger: 200,
      });

      // Verify transactional rollback of orphaned events and checkpoint update
      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockClientQuery).toHaveBeenCalledWith(
        'DELETE FROM contract_events WHERE ledger_seq > $1',
        [200],
      );
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO indexer_checkpoints'),
        [expect.any(String), 200, '0xhash_200'],
      );
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      expect(mockClientRelease).toHaveBeenCalledTimes(1);

      // Verify Redis cache and in-memory state were rewound to ledger 200
      expect(mockSetCache).toHaveBeenCalledWith(
        expect.stringContaining('indexer:checkpoint:'),
        200,
        3600,
      );
      expect(indexer.getCheckpointState()).toEqual({
        lastLedger: 200,
        lastLedgerHash: '0xhash_200',
        cursor: '200',
      });
      expect(indexer.getRecordedLedgerHash(201)).toBeUndefined();
      expect(indexer.getRecordedLedgerHash(200)).toBe('0xhash_200');
    });

    it('rolls back database transaction cleanly if rewindToAncestor fails', async () => {
      const indexer = new EventIndexer();
      indexer.recordLedgerHash(300, '0xhash_300');

      mockClientQuery.mockImplementation(async (sql: string) => {
        if (sql === 'BEGIN') return { rows: [] };
        if (typeof sql === 'string' && sql.includes('DELETE FROM contract_events')) {
          throw new Error('DB deadlock during reorg cleanup');
        }
        return { rows: [] };
      });

      await expect(indexer.rewindToAncestor(295, '0xhash_295')).rejects.toThrow(
        'DB deadlock during reorg cleanup',
      );

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClientRelease).toHaveBeenCalledTimes(1);
    });
  });
});
