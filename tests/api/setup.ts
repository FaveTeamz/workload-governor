import { Pool } from 'pg';
import { migrate } from '../../src/db';

// Runs once before all test suites (Jest globalSetup)
export default async function globalSetup(): Promise<void> {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ??
    'postgresql://test:test@localhost:5432/testdb';
  process.env.ADMIN_TOKEN = 'test-admin-token';

  await migrate();
}

/** Call at the start of each suite to start with a clean slate */
export async function resetDb(): Promise<void> {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  await db.query(
    'TRUNCATE issues, maintainers, applications, assignments RESTART IDENTITY CASCADE',
  );
  await db.end();
}
