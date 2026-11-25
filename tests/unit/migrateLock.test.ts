/**
 * #1255: migrations run under a PostgreSQL advisory lock that is always
 * released and that times out instead of hanging.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withMigrationLock, MigrationLockTimeoutError, MIGRATION_LOCK_ID } = require('../../scripts/migrate-lock');

type Query = (sql: string, params?: unknown[]) => Promise<{ rows: { locked?: boolean }[] }>;

/** Fake connection that grants the lock after `busyPolls` refusals. */
function fakeClient(busyPolls = 0) {
  let remaining = busyPolls;
  const calls: string[] = [];
  const query: Query = async (sql) => {
    calls.push(sql);
    if (sql.includes('pg_try_advisory_lock')) {
      if (remaining > 0) {
        remaining--;
        return { rows: [{ locked: false }] };
      }
      return { rows: [{ locked: true }] };
    }
    return { rows: [] };
  };
  return { query, calls };
}

/** Virtual clock so the timeout runs instantly. */
function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => { t += ms; } };
}

describe('withMigrationLock', () => {
  it('locks, runs the migration, then unlocks with the shared lock id', async () => {
    const client = fakeClient();
    const result = await withMigrationLock(client, async () => 'migrated', clock());
    expect(result).toBe('migrated');
    expect(client.calls).toEqual([
      'SELECT pg_try_advisory_lock($1::bigint) AS locked',
      'SELECT pg_advisory_unlock($1::bigint)',
    ]);
    expect(MIGRATION_LOCK_ID).toBe('748392019482');
  });

  it('waits for another runner to release the lock', async () => {
    const client = fakeClient(3);
    const c = clock();
    await withMigrationLock(client, async () => undefined, { ...c, pollMs: 1_000, timeoutMs: 60_000 });
    expect(client.calls.filter((s) => s.includes('pg_try_advisory_lock'))).toHaveLength(4);
    expect(c.now()).toBe(3_000);
  });

  it('releases the lock when the migration fails', async () => {
    const client = fakeClient();
    await expect(
      withMigrationLock(client, async () => { throw new Error('bad migration'); }, clock()),
    ).rejects.toThrow('bad migration');
    expect(client.calls[client.calls.length - 1]).toBe('SELECT pg_advisory_unlock($1::bigint)');
  });

  it('gives up after the timeout without running the migration', async () => {
    const client = fakeClient(Number.MAX_SAFE_INTEGER);
    let ran = false;
    await expect(
      withMigrationLock(client, async () => { ran = true; }, { ...clock(), timeoutMs: 60_000, pollMs: 1_000 }),
    ).rejects.toBeInstanceOf(MigrationLockTimeoutError);
    expect(ran).toBe(false);
    expect(client.calls.some((s) => s.includes('pg_advisory_unlock'))).toBe(false);
  });
});
