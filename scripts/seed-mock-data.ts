#!/usr/bin/env ts-node
/**
 * scripts/seed-mock-data.ts
 *
 * Seed script for local development and database testing.
 * Populates sample organizations, open issues, pending applications, and assignments.
 *
 * Usage:
 *   npm run db:seed
 *   ts-node scripts/seed-mock-data.ts
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { migrate } from '../src/db';

const pool = new Pool({
  connectionString:
    process.env['DATABASE_URL'] || 'postgresql://test:test@localhost:5432/testdb',
});

interface SampleOrg {
  org_id: string;
  contract_address: string;
}

interface SampleIssue {
  id: number;
  org_id: string;
  title: string;
  body: string;
  labels: string;
  github_url: string;
  status: string;
}

interface SampleApplication {
  contributor: string;
  org_id: string;
  issue_id: number;
  status?: string;
}

interface SampleAssignment {
  contributor: string;
  org_id: string;
  issue_id: number;
}

const SAMPLE_ORGS: SampleOrg[] = [
  {
    org_id: 'stellar-oss',
    contract_address: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB2KM2',
  },
  {
    org_id: 'org_stellar_001',
    contract_address: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
  },
  {
    org_id: 'soroban-ecosystem',
    contract_address: 'CBZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ3',
  },
];

const SAMPLE_ISSUES: SampleIssue[] = [
  {
    id: 1,
    org_id: 'stellar-oss',
    title: 'Add Stellar SDK retry mechanism with exponential backoff',
    body: 'Implement automatic retries for transient Horizon and Soroban RPC 504/429 status codes with exponential backoff and jitter.',
    labels: 'stellar,sdk,backend',
    github_url: 'https://github.com/stellar-oss/workload-governor/issues/1',
    status: 'open',
  },
  {
    id: 2,
    org_id: 'stellar-oss',
    title: 'Implement Soroban smart contract event indexer and listener',
    body: 'Stream contract events (applied, assigned, completed, revoked) from RPC and persist them into the relational event log.',
    labels: 'soroban,indexer',
    github_url: 'https://github.com/stellar-oss/workload-governor/issues/2',
    status: 'open',
  },
  {
    id: 3,
    org_id: 'stellar-oss',
    title: 'Add dark mode color tokens and theme switcher to dashboard',
    body: 'Support high-contrast and dark theme CSS custom properties across all UI components and navigation bars.',
    labels: 'frontend,ui,accessibility',
    github_url: 'https://github.com/stellar-oss/workload-governor/issues/3',
    status: 'open',
  },
  {
    id: 4,
    org_id: 'stellar-oss',
    title: 'Optimize database checkpoint queries for ledger ingestion',
    body: 'Add composite indexes on contract_events and batch ledger checkpoints every 100 blocks to optimize write performance.',
    labels: 'performance,database',
    github_url: 'https://github.com/stellar-oss/workload-governor/issues/4',
    status: 'open',
  },
  {
    id: 5,
    org_id: 'org_stellar_001',
    title: 'Implement two-step admin transfer propose and accept flow',
    body: 'Enforce two-step ownership transfer in the smart contract to prevent accidental admin lockouts or typos in address inputs.',
    labels: 'security,smart-contract',
    github_url: 'https://github.com/org-stellar-001/workload-governor/issues/5',
    status: 'open',
  },
  {
    id: 6,
    org_id: 'org_stellar_001',
    title: 'Add webhook notification delivery retry worker with dead-letter queue',
    body: 'Deliver signed HMAC webhooks on contributor assignment and milestone completion events with resilient delivery retries.',
    labels: 'webhooks,backend',
    github_url: 'https://github.com/org-stellar-001/workload-governor/issues/6',
    status: 'open',
  },
  {
    id: 7,
    org_id: 'org_stellar_001',
    title: 'Support CSV export for contributor audit logs and leaderboard stats',
    body: 'Enable organization admins to export activity records and fairness metrics for grant reporting and audit verification.',
    labels: 'frontend,reporting',
    github_url: 'https://github.com/org-stellar-001/workload-governor/issues/7',
    status: 'open',
  },
  {
    id: 8,
    org_id: 'soroban-ecosystem',
    title: 'Implement Soroban TTL extension background cron service',
    body: 'Periodically monitor contract instance and temporary/persistent storage TTL thresholds, issuing extension transactions automatically.',
    labels: 'soroban,cron,operations',
    github_url: 'https://github.com/soroban-ecosystem/workload-governor/issues/8',
    status: 'open',
  },
  {
    id: 9,
    org_id: 'soroban-ecosystem',
    title: 'Add Prometheus metrics endpoint for RPC response latency',
    body: 'Export latency histograms, RPC throughput gauges, and error counters to the Prometheus scrape target.',
    labels: 'observability,metrics',
    github_url: 'https://github.com/soroban-ecosystem/workload-governor/issues/9',
    status: 'open',
  },
];

const SAMPLE_APPLICATIONS: SampleApplication[] = [
  {
    contributor: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
    org_id: 'stellar-oss',
    issue_id: 1,
    status: 'pending',
  },
  {
    contributor: 'GBXXX1ABCDEFGHIJKLMNOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1',
    org_id: 'stellar-oss',
    issue_id: 2,
    status: 'pending',
  },
  {
    contributor: 'GCYYYY2BCDEFGHIJKLMNOPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA2',
    org_id: 'org_stellar_001',
    issue_id: 5,
    status: 'pending',
  },
  {
    contributor: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
    org_id: 'org_stellar_001',
    issue_id: 6,
    status: 'pending',
  },
  {
    contributor: 'GDZZZZ3CDEFGHIJKLMNOPQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA3',
    org_id: 'soroban-ecosystem',
    issue_id: 8,
    status: 'pending',
  },
];

const SAMPLE_ASSIGNMENTS: SampleAssignment[] = [
  {
    contributor: 'GBXXX1ABCDEFGHIJKLMNOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1',
    org_id: 'stellar-oss',
    issue_id: 4,
  },
  {
    contributor: 'GDZZZZ3CDEFGHIJKLMNOPQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA3',
    org_id: 'org_stellar_001',
    issue_id: 7,
  },
  {
    contributor: 'GCYYYY2BCDEFGHIJKLMNOPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA2',
    org_id: 'soroban-ecosystem',
    issue_id: 9,
  },
];

export async function seedMockData(): Promise<void> {
  console.log('==> [seed] Ensuring database tables exist...');
  try {
    await migrate();
  } catch (err) {
    console.warn('[seed] Migration check warning:', err instanceof Error ? err.message : err);
  }

  // Ensure extended issue columns exist if migrations were partial
  try {
    await pool.query(`
      ALTER TABLE issues ADD COLUMN IF NOT EXISTS body TEXT;
      ALTER TABLE issues ADD COLUMN IF NOT EXISTS labels TEXT;
      ALTER TABLE issues ADD COLUMN IF NOT EXISTS github_url TEXT;
      ALTER TABLE applications ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
    `);
  } catch {
    // Ignore if already present
  }

  console.log('==> [seed] Seeding sample organizations...');
  for (const org of SAMPLE_ORGS) {
    await pool.query(
      `INSERT INTO orgs (org_id, contract_address, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (org_id) DO UPDATE SET contract_address = EXCLUDED.contract_address`,
      [org.org_id, org.contract_address],
    );
  }
  console.log(`    Seeded ${SAMPLE_ORGS.length} organizations.`);

  console.log('==> [seed] Seeding sample open issues...');
  for (const issue of SAMPLE_ISSUES) {
    await pool.query(
      `INSERT INTO issues (id, org_id, title, body, labels, github_url, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (id) DO UPDATE
       SET title = EXCLUDED.title,
           body = EXCLUDED.body,
           labels = EXCLUDED.labels,
           github_url = EXCLUDED.github_url,
           status = EXCLUDED.status`,
      [
        issue.id,
        issue.org_id,
        issue.title,
        issue.body,
        issue.labels,
        issue.github_url,
        issue.status,
      ],
    );
  }
  // Reset issues sequence if needed
  try {
    await pool.query(`SELECT setval(pg_get_serial_sequence('issues', 'id'), (SELECT COALESCE(MAX(id), 1) FROM issues))`);
  } catch {
    // Non-fatal if sequence doesn't exist
  }
  console.log(`    Seeded ${SAMPLE_ISSUES.length} open issues.`);

  console.log('==> [seed] Seeding pending applications...');
  for (const app of SAMPLE_APPLICATIONS) {
    await pool.query(
      `INSERT INTO applications (contributor, org_id, issue_id, status, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (contributor, org_id, issue_id) DO NOTHING`,
      [app.contributor, app.org_id, app.issue_id, app.status ?? 'pending'],
    );
  }
  console.log(`    Seeded ${SAMPLE_APPLICATIONS.length} pending applications.`);

  console.log('==> [seed] Seeding assignments...');
  for (const assign of SAMPLE_ASSIGNMENTS) {
    await pool.query(
      `INSERT INTO assignments (contributor, org_id, issue_id, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (contributor, org_id, issue_id) DO NOTHING`,
      [assign.contributor, assign.org_id, assign.issue_id],
    );
  }
  console.log(`    Seeded ${SAMPLE_ASSIGNMENTS.length} assignments.`);

  // Seed sample timeline contract events for issue detail inspection
  try {
    console.log('==> [seed] Seeding sample contract events...');
    const sampleEvents = [
      {
        event_type: 'applied',
        contributor: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
        org_id: 'stellar-oss',
        issue_id: 1,
        tx_hash: 'tx_seed_app_001',
        event_index: 0,
        ledger_seq: 10001,
      },
      {
        event_type: 'assigned',
        contributor: 'GBXXX1ABCDEFGHIJKLMNOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1',
        org_id: 'stellar-oss',
        issue_id: 4,
        tx_hash: 'tx_seed_asgn_001',
        event_index: 0,
        ledger_seq: 10002,
      },
    ];

    for (const ev of sampleEvents) {
      await pool.query(
        `INSERT INTO contract_events (event_type, contributor, org_id, issue_id, tx_hash, event_index, ledger_seq, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (ledger_seq, tx_hash, event_index) DO NOTHING`,
        [ev.event_type, ev.contributor, ev.org_id, ev.issue_id, ev.tx_hash, ev.event_index, ev.ledger_seq],
      );
    }
  } catch {
    // Non-fatal if contract_events constraint differs
  }

  console.log('==> [seed] Database seeded successfully! 🎉');
}

if (require.main === module) {
  seedMockData()
    .then(() => pool.end())
    .catch((err) => {
      console.error('❌ [seed] Failed to seed database:', err);
      pool.end().finally(() => process.exit(1));
    });
}
