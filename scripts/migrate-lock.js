'use strict';

/**
 * Advisory-lock helper for migration runs (#1255).
 *
 * Every replica that starts during a rolling deploy may try to run
 * migrations. A PostgreSQL session-level advisory lock serializes them: the
 * first runner holds the lock while it migrates, and the others wait, then
 * find nothing left to apply. Waiting is bounded so a stuck holder fails
 * startup with a clear error instead of hanging forever.
 */

/** Fixed key shared by every migration runner (spec in issue #1255). */
const MIGRATION_LOCK_ID = '748392019482';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_MS = 1_000;

class MigrationLockTimeoutError extends Error {
  constructor(timeoutMs) {
    super(
      `Could not acquire the migration advisory lock (${MIGRATION_LOCK_ID}) within ${timeoutMs} ms; ` +
        'another migration run is still holding it. Retry once it finishes, or check pg_locks for a stuck session.',
    );
    this.name = 'MigrationLockTimeoutError';
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `fn` while holding the migration advisory lock on `client` (a single
 * pg connection, since session locks belong to the connection). Polls
 * pg_try_advisory_lock until `timeoutMs`, then throws
 * MigrationLockTimeoutError. The lock is always released in `finally`,
 * whether `fn` succeeds or throws.
 */
async function withMigrationLock(client, fn, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const now = options.now ?? Date.now;
  const wait = options.sleep ?? sleep;
  const log = options.log ?? (() => {});

  const deadline = now() + timeoutMs;
  let waited = false;
  for (;;) {
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1::bigint) AS locked', [MIGRATION_LOCK_ID]);
    if (rows[0] && rows[0].locked === true) break;
    if (now() >= deadline) throw new MigrationLockTimeoutError(timeoutMs);
    if (!waited) {
      log('Another migration run holds the advisory lock; waiting…');
      waited = true;
    }
    await wait(Math.min(pollMs, Math.max(0, deadline - now())));
  }

  try {
    return await fn();
  } finally {
    await client.query('SELECT pg_advisory_unlock($1::bigint)', [MIGRATION_LOCK_ID]);
  }
}

module.exports = {
  MIGRATION_LOCK_ID,
  DEFAULT_TIMEOUT_MS,
  MigrationLockTimeoutError,
  withMigrationLock,
};
