#!/usr/bin/env node
'use strict';

/**
 * Migration runner with a global advisory lock (#1255).
 *
 *   node scripts/migrate.js up   [extra node-pg-migrate args]
 *   node scripts/migrate.js down [extra node-pg-migrate args]
 *
 * Holds the migration advisory lock on its own connection while node-pg-migrate
 * runs, so concurrent replicas apply migrations one at a time. Exits non-zero
 * if the lock is not acquired within MIGRATION_LOCK_TIMEOUT_MS (default
 * 60000) or if node-pg-migrate fails. The lock is released either way.
 *
 * Env: DATABASE_URL (or PG* variables), MIGRATION_LOCK_TIMEOUT_MS.
 */

const { spawn } = require('child_process');
const { Client } = require('pg');
const { withMigrationLock, DEFAULT_TIMEOUT_MS } = require('./migrate-lock');

function runNodePgMigrate(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'npx',
      ['node-pg-migrate', ...args, '--migrations-dir', 'migrations', '--migrations-table', 'pgmigrations'],
      { stdio: 'inherit', shell: process.platform === 'win32' },
    );
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`node-pg-migrate exited with ${signal ?? `code ${code}`}`));
    });
  });
}

async function main() {
  const [direction, ...rest] = process.argv.slice(2);
  if (direction !== 'up' && direction !== 'down') {
    console.error('usage: node scripts/migrate.js <up|down> [node-pg-migrate args]');
    process.exit(2);
  }

  const timeoutMs = Number(process.env.MIGRATION_LOCK_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const client = new Client(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {});
  await client.connect();
  try {
    await withMigrationLock(client, () => runNodePgMigrate([direction, ...rest]), {
      timeoutMs,
      log: (msg) => console.log(`[migrate] ${msg}`),
    });
    console.log(`[migrate] ${direction} complete`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`[migrate] ${err.message}`);
  process.exit(1);
});
