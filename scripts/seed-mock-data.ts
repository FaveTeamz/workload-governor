#!/usr/bin/env ts-node
/**
 * scripts/seed-mock-data.ts
 *
 * Idempotent database seed script for local WorkloadGovernor development and
 * frontend testing. Populates sample organizations, maintainers, open issues,
 * pending applications, and active assignments.
 *
 * Usage:
 *   npm run db:seed
 */

import 'dotenv/config';
import { Pool, PoolClient } from 'pg';
import { getPool, migrate, closePool } from '../src/db';

export interface MockOrgSeed {
  org_id: string;
  contract_address: string;
}

export interface MockMaintainerSeed {
  address: string;
  org_id: string;
}

export interface MockIssueSeed {
  id: number;
  org_id: string;
  title: string;
  status: 'open' | 'assigned' | 'completed';
}

export interface MockApplicationSeed {
  contributor: string;
  org_id: string;
  issue_id: number;
}

export interface MockAssignmentSeed {
  contributor: string;
  org_id: string;
  issue_id: number;
}

export interface SeedSummary {
  orgs: number;
  maintainers: number;
  issues: number;
  applications: number;
  assignments: number;
}

export const MOCK_ORGS: readonly MockOrgSeed[] = [
  {
    org_id: 'stellar-oss',
    contract_address: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB2KM2',
  },
  {
    org_id: 'org_stellar_001',
    contract_address: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
  },
  {
    org_id: 'org-a',
    contract_address: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE3LP',
  },
];

export const MOCK_MAINTAINERS: readonly MockMaintainerSeed[] = [
  {
    address: 'GADMINMAINTAINER11111111111111111111111111111111111111111',
    org_id: 'stellar-oss',
  },
  {
    address: 'GADMINMAINTAINER22222222222222222222222222222222222222222',
    org_id: 'org_stellar_001',
  },
  {
    address: 'GADMINMAINTAINER33333333333333333333333333333333333333333',
    org_id: 'org-a',
  },
];

export const MOCK_ISSUES: readonly MockIssueSeed[] = [
  {
    id: 101,
    org_id: 'stellar-oss',
    title: 'Fix memory leak in Soroban RPC event poller',
    status: 'open',
  },
  {
    id: 102,
    org_id: 'stellar-oss',
    title: 'Add multi-organization workload gauge component',
    status: 'open',
  },
  {
    id: 103,
    org_id: 'stellar-oss',
    title: 'Implement TTL extension batch helper for pending applications',
    status: 'open',
  },
  {
    id: 201,
    org_id: 'org_stellar_001',
    title: 'Optimize XDR ScVal decoding for 3-topic contract events',
    status: 'open',
  },
  {
    id: 202,
    org_id: 'org_stellar_001',
    title: 'Add cursor pagination for contributor application history',
    status: 'open',
  },
  {
    id: 301,
    org_id: 'org-a',
    title: 'Document Soroban storage key prefix collision invariants',
    status: 'open',
  },
];

export const MOCK_APPLICATIONS: readonly MockApplicationSeed[] = [
  {
    contributor: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
    org_id: 'stellar-oss',
    issue_id: 101,
  },
  {
    contributor: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
    org_id: 'org_stellar_001',
    issue_id: 201,
  },
  {
    contributor: 'GBXXX1ABCDEFGHIJKLMNOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1',
    org_id: 'stellar-oss',
    issue_id: 102,
  },
  {
    contributor: 'GCYYY2ABCDEFGHIJKLMNOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA2',
    org_id: 'org-a',
    issue_id: 301,
  },
];

export const MOCK_ASSIGNMENTS: readonly MockAssignmentSeed[] = [
  {
    contributor: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
    org_id: 'stellar-oss',
    issue_id: 103,
  },
  {
    contributor: 'GBXXX1ABCDEFGHIJKLMNOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1',
    org_id: 'org_stellar_001',
    issue_id: 202,
  },
];

/**
 * Seeds the database with mock organizations, maintainers, open issues,
 * pending applications, and active assignments.
 *
 * All statements use `ON CONFLICT` clauses so re-running the seed script is
 * completely idempotent.
 */
export async function seedMockData(customPool?: Pool): Promise<SeedSummary> {
  const dbPool = customPool ?? getPool();

  if (!customPool) {
    await migrate();
  }

  const client: PoolClient = await dbPool.connect();
  try {
    await client.query('BEGIN');

    let orgsInserted = 0;
    for (const org of MOCK_ORGS) {
      const res = await client.query(
        `INSERT INTO orgs (org_id, contract_address)
         VALUES ($1, $2)
         ON CONFLICT (org_id) DO UPDATE SET contract_address = EXCLUDED.contract_address`,
        [org.org_id, org.contract_address],
      );
      orgsInserted += res.rowCount ?? 0;
    }

    let maintainersInserted = 0;
    for (const maint of MOCK_MAINTAINERS) {
      const res = await client.query(
        `INSERT INTO maintainers (address, org_id)
         VALUES ($1, $2)
         ON CONFLICT (address, org_id) DO NOTHING`,
        [maint.address, maint.org_id],
      );
      maintainersInserted += res.rowCount ?? 0;
    }

    let issuesInserted = 0;
    for (const issue of MOCK_ISSUES) {
      const res = await client.query(
        `INSERT INTO issues (id, org_id, title, status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
           SET org_id = EXCLUDED.org_id,
               title = EXCLUDED.title,
               status = EXCLUDED.status`,
        [issue.id, issue.org_id, issue.title, issue.status],
      );
      issuesInserted += res.rowCount ?? 0;
    }

    let applicationsInserted = 0;
    for (const app of MOCK_APPLICATIONS) {
      const res = await client.query(
        `INSERT INTO applications (contributor, org_id, issue_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (contributor, org_id, issue_id) DO NOTHING`,
        [app.contributor, app.org_id, app.issue_id],
      );
      applicationsInserted += res.rowCount ?? 0;
    }

    let assignmentsInserted = 0;
    for (const asgn of MOCK_ASSIGNMENTS) {
      const res = await client.query(
        `INSERT INTO assignments (contributor, org_id, issue_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (contributor, org_id, issue_id) DO NOTHING`,
        [asgn.contributor, asgn.org_id, asgn.issue_id],
      );
      assignmentsInserted += res.rowCount ?? 0;
    }

    await client.query('COMMIT');

    return {
      orgs: orgsInserted,
      maintainers: maintainersInserted,
      issues: issuesInserted,
      applications: applicationsInserted,
      assignments: assignmentsInserted,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seedMockData()
    .then((summary) => {
      console.log('[db:seed] Mock data seeded successfully:', summary);
      return closePool();
    })
    .catch((err) => {
      console.error(
        '[db:seed] Failed to seed mock data:',
        err instanceof Error ? err.message : String(err),
      );
      process.exit(1);
    });
}
