/**
 * tests/unit/migrations.test.ts
 *
 * Unit tests for the DB migration system.
 * Verifies that:
 *  - The migrations/ directory contains at least one migration file
 *  - migrate() resolves without throwing when node-pg-migrate is mocked
 */

import path from 'path';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Mock node-pg-migrate so the test never touches a real database
// ---------------------------------------------------------------------------
jest.mock('node-pg-migrate', () => ({
  default: jest.fn().mockResolvedValue(undefined),
}));

// Also mock the db pool so importing db.ts doesn't attempt a real connection
jest.mock('pg', () => {
  const pool = {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn(),
    }),
    end: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  };
  return { Pool: jest.fn(() => pool) };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { default: pgMigrateRun } = require('node-pg-migrate') as { default: jest.Mock };
import { migrate } from '../../src/db';

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

describe('DB migrations', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, DATABASE_URL: 'postgresql://test:test@localhost/testdb' };
  });

  afterEach(() => {
    process.env = OLD_ENV;
    jest.clearAllMocks();
  });

  it('migrations/ directory exists and contains at least one file', () => {
    expect(fs.existsSync(MIGRATIONS_DIR)).toBe(true);
    const files = fs.readdirSync(MIGRATIONS_DIR);
    expect(files.length).toBeGreaterThan(0);
  });

  it('first migration file starts with "1_"', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).sort();
    expect(files[0]).toMatch(/^1_/);
  });

  it('migrate() calls node-pg-migrate runner with correct direction', async () => {
    await migrate();

    expect(pgMigrateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'up',
        databaseUrl: 'postgresql://test:test@localhost/testdb',
        migrationsTable: 'pgmigrations',
      }),
    );
  });

  it('migrate() resolves without throwing', async () => {
    await expect(migrate()).resolves.toBeUndefined();
  });

  it('migrate() throws when DATABASE_URL is not set', async () => {
    delete process.env['DATABASE_URL'];

    // Re-import migrate with cleared env
    jest.resetModules();
    jest.mock('node-pg-migrate', () => ({ run: jest.fn() }));
    jest.mock('pg', () => {
      const pool = { query: jest.fn(), on: jest.fn(), end: jest.fn(), connect: jest.fn() };
      return { Pool: jest.fn(() => pool) };
    });

    const { migrate: freshMigrate } = await import('../../src/db');
    await expect(freshMigrate()).rejects.toThrow('DATABASE_URL');
  });
});
