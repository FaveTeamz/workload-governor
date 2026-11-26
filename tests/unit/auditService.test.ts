/**
 * auditService.test.ts
 *
 * Unit tests for the audit log hash-chain implementation.
 *
 * All tests run in-process — no live database is needed.  A thin mock of
 * pg.Pool+Client is wired up so the service's SQL queries write to and read
 * from an in-memory array of rows instead.
 *
 * Test plan:
 *   1. Pure helper functions (computeEntryHash, computeSignature)
 *   2. Chain construction — 10 entries chained correctly
 *   3. verify() on a pristine 10-entry chain returns ok:true
 *   4. verify() detects a tampered payload byte
 *   5. verify() detects a tampered entry_hash value
 *   6. verify() detects a tampered signature value
 *   7. verify() detects a broken previous_hash link
 *   8. verify() on an empty log returns ok:true with total:0
 *   9. AuditService constructor throws when AUDIT_SECRET is missing
 */

import {
  GENESIS_HASH,
  computeEntryHash,
  computeSignature,
  buildHashInput,
  AuditService,
  AuditEntry,
} from '../../src/services/sealedAuditService';

// ─── In-memory DB mock ────────────────────────────────────────────────────────

type MockRow = AuditEntry;

/**
 * Builds a mock pg Pool whose client executes a minimal subset of queries
 * that AuditService actually issues:
 *
 *   SELECT entry_hash … ORDER BY id DESC LIMIT 1 FOR UPDATE
 *   SELECT NOW()
 *   INSERT INTO audit_log … RETURNING *
 *   SELECT … FROM audit_log ORDER BY id ASC
 */
function buildMockPool(store: MockRow[] = []): {
  pool: import('pg').Pool;
  store: MockRow[];
} {
  let idCounter = 1;
  let inTransaction = false;

  const client = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      const q = (sql as string).replace(/\s+/g, ' ').trim();

      if (q === 'BEGIN') {
        inTransaction = true;
        return { rows: [] };
      }
      if (q === 'COMMIT') {
        inTransaction = false;
        return { rows: [] };
      }
      if (q === 'ROLLBACK') {
        inTransaction = false;
        return { rows: [] };
      }

      // Last entry_hash for chain head
      if (q.includes('SELECT entry_hash') && q.includes('ORDER BY id DESC')) {
        if (store.length === 0) return { rows: [] };
        const last = store[store.length - 1];
        return { rows: [{ entry_hash: last.entry_hash }] };
      }

      // Server timestamp
      if (q.includes('SELECT NOW()')) {
        return { rows: [{ now: new Date('2026-01-01T00:00:00.000Z') }] };
      }

      // INSERT … RETURNING
      if (q.startsWith('INSERT INTO audit_log')) {
        if (!params || params.length < 6) throw new Error('missing INSERT params');
        const [event_type, payloadJson, created_at, previous_hash, entry_hash, signature] =
          params as [string, string, Date, string, string, string];
        const row: MockRow = {
          id: idCounter++,
          event_type,
          payload: JSON.parse(payloadJson),
          created_at,
          previous_hash,
          entry_hash,
          signature,
        };
        store.push(row);
        return { rows: [row] };
      }

      // SELECT all rows for verify / listAll
      if (q.includes('FROM audit_log') && q.includes('ORDER BY id ASC')) {
        return { rows: [...store] };
      }

      return { rows: [] };
    }),
    release: jest.fn(),
  };

  const pool = {
    connect: jest.fn(async () => client),
    query: jest.fn(async (sql: string) => {
      const q = (sql as string).replace(/\s+/g, ' ').trim();
      if (q.includes('FROM audit_log') && q.includes('ORDER BY id ASC')) {
        return { rows: [...store] };
      }
      return { rows: [] };
    }),
  } as unknown as import('pg').Pool;

  return { pool, store };
}

// ─── Helpers used by multiple tests ──────────────────────────────────────────

const SECRET = 'test-secret-do-not-use-in-prod';

function makeService(store: MockRow[]): AuditService {
  const { pool } = buildMockPool(store);
  return new AuditService(pool, SECRET);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('computeEntryHash', () => {
  const ts = new Date('2026-01-01T12:00:00.000Z');

  it('produces a 64-character hex string', () => {
    const h = computeEntryHash(GENESIS_HASH, 'TEST_EVENT', {}, ts);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same inputs', () => {
    const a = computeEntryHash(GENESIS_HASH, 'TEST_EVENT', { x: 1 }, ts);
    const b = computeEntryHash(GENESIS_HASH, 'TEST_EVENT', { x: 1 }, ts);
    expect(a).toBe(b);
  });

  it('changes when event_type changes', () => {
    const a = computeEntryHash(GENESIS_HASH, 'TYPE_A', {}, ts);
    const b = computeEntryHash(GENESIS_HASH, 'TYPE_B', {}, ts);
    expect(a).not.toBe(b);
  });

  it('changes when payload changes', () => {
    const a = computeEntryHash(GENESIS_HASH, 'T', { key: 'a' }, ts);
    const b = computeEntryHash(GENESIS_HASH, 'T', { key: 'b' }, ts);
    expect(a).not.toBe(b);
  });

  it('changes when previous_hash changes', () => {
    const a = computeEntryHash('aaa', 'T', {}, ts);
    const b = computeEntryHash('bbb', 'T', {}, ts);
    expect(a).not.toBe(b);
  });

  it('changes when timestamp changes', () => {
    const ts2 = new Date('2026-01-02T12:00:00.000Z');
    const a = computeEntryHash(GENESIS_HASH, 'T', {}, ts);
    const b = computeEntryHash(GENESIS_HASH, 'T', {}, ts2);
    expect(a).not.toBe(b);
  });

  it('is payload-key-order-independent (sorted serialisation)', () => {
    const a = computeEntryHash(GENESIS_HASH, 'T', { z: 1, a: 2 }, ts);
    const b = computeEntryHash(GENESIS_HASH, 'T', { a: 2, z: 1 }, ts);
    expect(a).toBe(b);
  });
});

describe('computeSignature', () => {
  it('produces a 64-character hex string', () => {
    const sig = computeSignature('somehash', SECRET);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    expect(computeSignature('h', SECRET)).toBe(computeSignature('h', SECRET));
  });

  it('changes when the hash changes', () => {
    expect(computeSignature('h1', SECRET)).not.toBe(computeSignature('h2', SECRET));
  });

  it('changes when the secret changes', () => {
    expect(computeSignature('h', 'secret-a')).not.toBe(computeSignature('h', 'secret-b'));
  });
});

describe('AuditService.append — chain construction', () => {
  it('builds a correctly chained sequence of 10 entries', async () => {
    const store: MockRow[] = [];
    const service = makeService(store);

    for (let i = 0; i < 10; i++) {
      await service.append(`EVENT_${i}`, { index: i });
    }

    expect(store).toHaveLength(10);

    // Walk the chain manually and verify every link.
    let expectedPrev = GENESIS_HASH;
    for (const row of store) {
      expect(row.previous_hash).toBe(expectedPrev);

      const derived = computeEntryHash(
        row.previous_hash,
        row.event_type,
        row.payload,
        new Date(row.created_at),
      );
      expect(row.entry_hash).toBe(derived);
      expect(row.signature).toBe(computeSignature(derived, SECRET));

      expectedPrev = row.entry_hash;
    }
  });

  it('first entry uses GENESIS_HASH as previous_hash', async () => {
    const store: MockRow[] = [];
    const service = makeService(store);
    await service.append('FIRST', {});
    expect(store[0].previous_hash).toBe(GENESIS_HASH);
  });

  it('each subsequent entry references the entry_hash of the row before it', async () => {
    const store: MockRow[] = [];
    const service = makeService(store);
    await service.append('A', {});
    await service.append('B', {});
    await service.append('C', {});
    expect(store[1].previous_hash).toBe(store[0].entry_hash);
    expect(store[2].previous_hash).toBe(store[1].entry_hash);
  });
});

describe('AuditService.verify — pristine chain', () => {
  it('returns ok:true and correct total for a 10-entry chain', async () => {
    const store: MockRow[] = [];
    const service = makeService(store);

    for (let i = 0; i < 10; i++) {
      await service.append(`STEP_${i}`, { step: i });
    }

    const result = await service.verify();
    expect(result.ok).toBe(true);
    expect(result.total).toBe(10);
    expect(result.broken).toHaveLength(0);
  });

  it('returns ok:true and total:0 for an empty log', async () => {
    const service = makeService([]);
    const result = await service.verify();
    expect(result.ok).toBe(true);
    expect(result.total).toBe(0);
    expect(result.broken).toHaveLength(0);
  });
});

describe('AuditService.verify — tamper detection', () => {
  /** Builds a 10-entry store and returns both the store and service. */
  async function buildChain(): Promise<{ store: MockRow[]; service: AuditService }> {
    const store: MockRow[] = [];
    const service = makeService(store);
    for (let i = 0; i < 10; i++) {
      await service.append(`EV_${i}`, { i });
    }
    return { store, service };
  }

  it('detects a tampered payload byte (mutate store[4].payload)', async () => {
    const { store, service } = await buildChain();

    // Mutate one byte in entry 5 (index 4)
    store[4].payload = { i: 999 };

    const result = await service.verify();
    expect(result.ok).toBe(false);
    expect(result.broken.some((b) => b.id === store[4].id)).toBe(true);
    expect(result.broken[0].reason).toMatch(/entry_hash mismatch/);
  });

  it('detects a tampered event_type', async () => {
    const { store, service } = await buildChain();
    store[2].event_type = 'INJECTED';

    const result = await service.verify();
    expect(result.ok).toBe(false);
    expect(result.broken.some((b) => b.id === store[2].id)).toBe(true);
  });

  it('detects a directly overwritten entry_hash', async () => {
    const { store, service } = await buildChain();
    store[6].entry_hash = 'a'.repeat(64);   // plausible-looking but wrong

    const result = await service.verify();
    expect(result.ok).toBe(false);
    // The tampered entry OR the next one (whose previous_hash no longer matches)
    // must appear in broken.
    expect(result.broken.length).toBeGreaterThan(0);
  });

  it('detects a tampered signature', async () => {
    const { store, service } = await buildChain();
    store[1].signature = 'b'.repeat(64);

    const result = await service.verify();
    expect(result.ok).toBe(false);
    expect(result.broken.some((b) => b.id === store[1].id)).toBe(true);
    expect(result.broken[0].reason).toMatch(/signature mismatch/);
  });

  it('detects a broken previous_hash link (deleted-row simulation)', async () => {
    const { store, service } = await buildChain();
    // Simulate deleting entry 3 by patching entry 4's previous_hash to skip it.
    store[4].previous_hash = store[2].entry_hash;

    const result = await service.verify();
    expect(result.ok).toBe(false);
    expect(result.broken.some((b) => b.id === store[4].id)).toBe(true);
    expect(result.broken[0].reason).toMatch(/previous_hash mismatch/);
  });

  it('reports broken link for every tampered entry when multiple rows are modified', async () => {
    const { store, service } = await buildChain();
    store[0].payload = { tampered: true };
    store[7].payload = { tampered: true };

    const result = await service.verify();
    expect(result.ok).toBe(false);
    // Both modified entries must be reported
    const brokenIds = result.broken.map((b) => b.id);
    expect(brokenIds).toContain(store[0].id);
    expect(brokenIds).toContain(store[7].id);
  });
});

describe('AuditService constructor', () => {
  it('throws when AUDIT_SECRET is absent and no secret is passed', () => {
    const savedSecret = process.env.AUDIT_SECRET;
    delete process.env.AUDIT_SECRET;

    const { pool } = buildMockPool();
    expect(() => new AuditService(pool)).toThrow('AUDIT_SECRET');

    process.env.AUDIT_SECRET = savedSecret;
  });

  it('accepts an explicitly passed secret without reading env', () => {
    const savedSecret = process.env.AUDIT_SECRET;
    delete process.env.AUDIT_SECRET;

    const { pool } = buildMockPool();
    expect(() => new AuditService(pool, 'explicit-secret')).not.toThrow();

    process.env.AUDIT_SECRET = savedSecret;
  });
});
