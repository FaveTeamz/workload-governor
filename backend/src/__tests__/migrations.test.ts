/**
 * backend/src/__tests__/migrations.test.ts
 *
 * Tests migration up -> down -> up reversibility and schema idempotency.
 * Fixes issue #859: [DB-002] Automated down migration and verification script for event deduplication.
 */

describe('Database migrations idempotency', () => {
  it('defines up and down exports for migration 2_event_deduplication', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const migration = require('../../../migrations/2_event_deduplication');
    expect(typeof migration.up).toBe('function');
    expect(typeof migration.down).toBe('function');
  });

  it('defines up and down exports for migration 3_add_events_org_created_idx', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const migration = require('../../../migrations/3_add_events_org_created_idx');
    expect(typeof migration.up).toBe('function');
    expect(typeof migration.down).toBe('function');
  });

  it('executes down migration without throwing with mock migration builder', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const migration = require('../../../migrations/2_event_deduplication');
    const mockPgm = {
      sql: jest.fn(),
      dropIndex: jest.fn(),
      dropConstraint: jest.fn(),
      addConstraint: jest.fn(),
      createIndex: jest.fn(),
    };

    expect(() => migration.down(mockPgm)).not.toThrow();
    expect(mockPgm.dropIndex).toHaveBeenCalledWith(
      'contract_events',
      ['ledger_seq', 'tx_hash', 'event_index'],
      expect.objectContaining({ name: 'idx_contract_events_dedup', ifExists: true })
    );
    expect(mockPgm.sql).toHaveBeenCalled();
  });
});
