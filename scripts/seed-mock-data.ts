#!/usr/bin/env ts-node
/**
 * scripts/seed-mock-data.ts
 *
 * Fast, idempotent database seed script for local WorkloadGovernor development
 * and frontend testing. Populates realistic organizations, maintainers, 30 issues
 * with difficulty and category tags, 10 contributors with realistic workload states,
 * and historical event timeline records for charts and activity feeds.
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
  labels: string[];
  created_at: string;
}

export interface MockApplicationSeed {
  contributor: string;
  org_id: string;
  issue_id: number;
  created_at: string;
}

export interface MockAssignmentSeed {
  contributor: string;
  org_id: string;
  issue_id: number;
  created_at: string;
}

export interface MockEventSeed {
  org_id: string;
  event_type: string;
  issue_id: string;
  contributor: string;
  tx_hash: string;
  occurred_at: string;
}

export interface MockContractEventSeed {
  event_type: string;
  contributor: string;
  org_id: string;
  issue_id: number;
  tx_hash: string;
  event_index: number;
  ledger_seq: number;
  timestamp: string;
}

export interface SeedSummary {
  orgs: number;
  maintainers: number;
  issues: number;
  labels: number;
  applications: number;
  assignments: number;
  events: number;
  contractEvents: number;
}

// ─── 5 Core Organizations ───────────────────────────────────────────────────

export const MOCK_ORGS: readonly MockOrgSeed[] = [
  {
    org_id: 'stellar',
    contract_address: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASTLR',
  },
  {
    org_id: 'soroban-governor',
    contract_address: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASGVR',
  },
  {
    org_id: 'wave-builders',
    contract_address: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWAVE',
  },
  {
    org_id: 'defi-alliance',
    contract_address: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADEFI',
  },
  {
    org_id: 'open-tools',
    contract_address: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATOOL',
  },
];

// ─── Maintainers ────────────────────────────────────────────────────────────

export const MOCK_MAINTAINERS: readonly MockMaintainerSeed[] = [
  {
    address: 'GADMINMAINTAINER11111111111111111111111111111111111111111',
    org_id: 'stellar',
  },
  {
    address: 'GADMINMAINTAINER22222222222222222222222222222222222222222',
    org_id: 'soroban-governor',
  },
  {
    address: 'GADMINMAINTAINER33333333333333333333333333333333333333333',
    org_id: 'wave-builders',
  },
  {
    address: 'GADMINMAINTAINER44444444444444444444444444444444444444444',
    org_id: 'defi-alliance',
  },
  {
    address: 'GADMINMAINTAINER55555555555555555555555555555555555555555',
    org_id: 'open-tools',
  },
];

// ─── 10 Contributors ────────────────────────────────────────────────────────
// Realistic workload profiles:
// Contributor A (CONTRIBUTOR_A): Near cap at 14/15 pending applications
// Contributor B (CONTRIBUTOR_B): Heavy active workload with 3 assignments
// Contributors C–J: Varied workload distributions

export const CONTRIBUTORS = {
  A: 'GA7B5432CONTRIBUTOR111111111111111111111111111111111111111', // 14 pending, 1 assignment
  B: 'GB8C6543CONTRIBUTOR222222222222222222222222222222222222222', // 5 pending, 3 assignments
  C: 'GC9D7654CONTRIBUTOR333333333333333333333333333333333333333', // 10 pending, 2 assignments
  D: 'GD1E8765CONTRIBUTOR444444444444444444444444444444444444444', // 7 pending, 1 assignment
  E: 'GE2F9876CONTRIBUTOR555555555555555555555555555555555555555', // 5 pending, 2 assignments
  F: 'GF3G0987CONTRIBUTOR666666666666666666666666666666666666666', // 3 pending, 1 assignment
  G: 'GG4H1098CONTRIBUTOR777777777777777777777777777777777777777', // 2 pending, 0 assignments
  H: 'GH5I2109CONTRIBUTOR888888888888888888888888888888888888888', // 1 pending, 1 assignment
  I: 'GI6J3210CONTRIBUTOR999999999999999999999999999999999999999', // 0 pending, 2 assignments
  J: 'GJ7K4321CONTRIBUTOR000000000000000000000000000000000000000', // 1 pending, 0 assignments
} as const;

// ─── 30 Issues with Difficulty Tags and Categories ──────────────────────────

export const MOCK_ISSUES: readonly MockIssueSeed[] = [
  // stellar (issues 1-6)
  {
    id: 1,
    org_id: 'stellar',
    title: 'Fix memory leak in Soroban RPC event poller',
    status: 'open',
    labels: ['good first issue', 'easy', 'backend', 'performance'],
    created_at: '2026-04-10T10:00:00Z',
  },
  {
    id: 2,
    org_id: 'stellar',
    title: 'Add multi-organization workload gauge component',
    status: 'assigned',
    labels: ['medium', 'frontend', 'ui/ux'],
    created_at: '2026-04-15T11:30:00Z',
  },
  {
    id: 3,
    org_id: 'stellar',
    title: 'Implement TTL extension batch helper for pending applications',
    status: 'assigned',
    labels: ['hard', 'smart-contract', 'backend'],
    created_at: '2026-04-20T14:15:00Z',
  },
  {
    id: 4,
    org_id: 'stellar',
    title: 'Optimize XDR ScVal decoding for 3-topic contract events',
    status: 'open',
    labels: ['medium', 'smart-contract', 'performance'],
    created_at: '2026-05-01T09:00:00Z',
  },
  {
    id: 5,
    org_id: 'stellar',
    title: 'Add cursor pagination for contributor application history',
    status: 'open',
    labels: ['good first issue', 'easy', 'backend'],
    created_at: '2026-05-05T12:00:00Z',
  },
  {
    id: 6,
    org_id: 'stellar',
    title: 'Implement zero-downtime database migration runner',
    status: 'completed',
    labels: ['hard', 'devops', 'database'],
    created_at: '2026-03-01T08:00:00Z',
  },

  // soroban-governor (issues 7-12)
  {
    id: 7,
    org_id: 'soroban-governor',
    title: 'Document Soroban storage key prefix collision invariants',
    status: 'open',
    labels: ['good first issue', 'easy', 'documentation'],
    created_at: '2026-04-18T16:00:00Z',
  },
  {
    id: 8,
    org_id: 'soroban-governor',
    title: 'Enforce quorum validation on emergency parameter updates',
    status: 'assigned',
    labels: ['hard', 'smart-contract', 'security'],
    created_at: '2026-04-25T13:45:00Z',
  },
  {
    id: 9,
    org_id: 'soroban-governor',
    title: 'Build voting proposal progress bar widget',
    status: 'open',
    labels: ['easy', 'frontend'],
    created_at: '2026-05-02T10:10:00Z',
  },
  {
    id: 10,
    org_id: 'soroban-governor',
    title: 'Add rate limiting to governor transaction submission RPC',
    status: 'open',
    labels: ['medium', 'backend', 'security'],
    created_at: '2026-05-06T15:30:00Z',
  },
  {
    id: 11,
    org_id: 'soroban-governor',
    title: 'Create Prometheus alerting rules for failed proposal simulations',
    status: 'assigned',
    labels: ['medium', 'devops', 'observability'],
    created_at: '2026-05-08T11:20:00Z',
  },
  {
    id: 12,
    org_id: 'soroban-governor',
    title: 'Audit storage footprint and TTL eviction parameters',
    status: 'completed',
    labels: ['hard', 'smart-contract'],
    created_at: '2026-03-15T09:30:00Z',
  },

  // wave-builders (issues 13-18)
  {
    id: 13,
    org_id: 'wave-builders',
    title: 'Implement community hackathon leaderboard edge caching',
    status: 'assigned',
    labels: ['medium', 'backend', 'performance'],
    created_at: '2026-04-12T14:00:00Z',
  },
  {
    id: 14,
    org_id: 'wave-builders',
    title: 'Design responsive task review card with modal preview',
    status: 'open',
    labels: ['good first issue', 'easy', 'frontend', 'ui/ux'],
    created_at: '2026-04-22T10:30:00Z',
  },
  {
    id: 15,
    org_id: 'wave-builders',
    title: 'Add webhook notification dispatcher with exponential backoff',
    status: 'assigned',
    labels: ['hard', 'backend', 'devops'],
    created_at: '2026-05-03T16:45:00Z',
  },
  {
    id: 16,
    org_id: 'wave-builders',
    title: 'Validate signed XDR envelopes for cross-organization grants',
    status: 'open',
    labels: ['medium', 'smart-contract', 'security'],
    created_at: '2026-05-07T08:50:00Z',
  },
  {
    id: 17,
    org_id: 'wave-builders',
    title: 'Write interactive quickstart tutorial for new contributors',
    status: 'open',
    labels: ['good first issue', 'easy', 'documentation'],
    created_at: '2026-05-10T12:15:00Z',
  },
  {
    id: 18,
    org_id: 'wave-builders',
    title: 'Setup automated Lighthouse accessibility score regression test',
    status: 'completed',
    labels: ['medium', 'frontend', 'ci'],
    created_at: '2026-03-20T17:00:00Z',
  },

  // defi-alliance (issues 19-24)
  {
    id: 19,
    org_id: 'defi-alliance',
    title: 'Integrate automated slippage protection check in swap router',
    status: 'open',
    labels: ['hard', 'smart-contract', 'defi'],
    created_at: '2026-04-14T09:15:00Z',
  },
  {
    id: 20,
    org_id: 'defi-alliance',
    title: 'Display real-time pool APR and liquidity depth graphs',
    status: 'assigned',
    labels: ['medium', 'frontend', 'defi'],
    created_at: '2026-04-26T13:00:00Z',
  },
  {
    id: 21,
    org_id: 'defi-alliance',
    title: 'Sanitize webhook payload inputs to prevent SSRF vulnerabilities',
    status: 'assigned',
    labels: ['hard', 'security', 'backend'],
    created_at: '2026-05-04T11:40:00Z',
  },
  {
    id: 22,
    org_id: 'defi-alliance',
    title: 'Add dark mode toggle and persistent theme preference store',
    status: 'open',
    labels: ['good first issue', 'easy', 'frontend'],
    created_at: '2026-05-09T15:20:00Z',
  },
  {
    id: 23,
    org_id: 'defi-alliance',
    title: 'Implement WebSocket feed for instant trade order matching',
    status: 'open',
    labels: ['hard', 'backend', 'performance'],
    created_at: '2026-05-11T10:00:00Z',
  },
  {
    id: 24,
    org_id: 'defi-alliance',
    title: 'Configure S3 state bucket versioning and public access blocks',
    status: 'completed',
    labels: ['medium', 'devops', 'terraform'],
    created_at: '2026-03-25T14:30:00Z',
  },

  // open-tools (issues 25-30)
  {
    id: 25,
    org_id: 'open-tools',
    title: 'Publish CLI tool for generating local testnet contributor wallets',
    status: 'open',
    labels: ['good first issue', 'easy', 'dx', 'cli'],
    created_at: '2026-04-16T11:00:00Z',
  },
  {
    id: 26,
    org_id: 'open-tools',
    title: 'Support hardware wallet Ledger connection in browser extension',
    status: 'assigned',
    labels: ['hard', 'frontend', 'security'],
    created_at: '2026-04-28T15:30:00Z',
  },
  {
    id: 27,
    org_id: 'open-tools',
    title: 'Mask sensitive credentials and auth tokens in pino log output',
    status: 'assigned',
    labels: ['medium', 'backend', 'observability'],
    created_at: '2026-05-05T09:45:00Z',
  },
  {
    id: 28,
    org_id: 'open-tools',
    title: 'Generate OpenAPI 3.0 TypeScript client SDK packages',
    status: 'open',
    labels: ['medium', 'dx', 'documentation'],
    created_at: '2026-05-08T14:10:00Z',
  },
  {
    id: 29,
    org_id: 'open-tools',
    title: 'Add toast notification system with auto-dismiss timers',
    status: 'open',
    labels: ['good first issue', 'easy', 'frontend', 'ui/ux'],
    created_at: '2026-05-12T16:00:00Z',
  },
  {
    id: 30,
    org_id: 'open-tools',
    title: 'Implement dead-letter queue (DLQ) replay script for failed webhooks',
    status: 'completed',
    labels: ['medium', 'backend', 'operations'],
    created_at: '2026-03-30T10:20:00Z',
  },
];

// ─── Applications (Workload States) ─────────────────────────────────────────

export const MOCK_APPLICATIONS: readonly MockApplicationSeed[] = [
  // Contributor A: 14 pending applications (at 14/15 near global cap)
  { contributor: CONTRIBUTORS.A, org_id: 'stellar', issue_id: 1, created_at: '2026-05-01T10:00:00Z' },
  { contributor: CONTRIBUTORS.A, org_id: 'stellar', issue_id: 4, created_at: '2026-05-02T10:00:00Z' },
  { contributor: CONTRIBUTORS.A, org_id: 'stellar', issue_id: 5, created_at: '2026-05-03T10:00:00Z' },
  { contributor: CONTRIBUTORS.A, org_id: 'soroban-governor', issue_id: 7, created_at: '2026-05-04T10:00:00Z' },
  { contributor: CONTRIBUTORS.A, org_id: 'soroban-governor', issue_id: 9, created_at: '2026-05-05T10:00:00Z' },
  { contributor: CONTRIBUTORS.A, org_id: 'soroban-governor', issue_id: 10, created_at: '2026-05-06T10:00:00Z' },
  { contributor: CONTRIBUTORS.A, org_id: 'wave-builders', issue_id: 14, created_at: '2026-05-07T10:00:00Z' },
  { contributor: CONTRIBUTORS.A, org_id: 'wave-builders', issue_id: 16, created_at: '2026-05-08T10:00:00Z' },
  { contributor: CONTRIBUTORS.A, org_id: 'wave-builders', issue_id: 17, created_at: '2026-05-09T10:00:00Z' },
  { contributor: CONTRIBUTORS.A, org_id: 'defi-alliance', issue_id: 19, created_at: '2026-05-10T10:00:00Z' },
  { contributor: CONTRIBUTORS.A, org_id: 'defi-alliance', issue_id: 22, created_at: '2026-05-11T10:00:00Z' },
  { contributor: CONTRIBUTORS.A, org_id: 'defi-alliance', issue_id: 23, created_at: '2026-05-12T10:00:00Z' },
  { contributor: CONTRIBUTORS.A, org_id: 'open-tools', issue_id: 25, created_at: '2026-05-13T10:00:00Z' },
  { contributor: CONTRIBUTORS.A, org_id: 'open-tools', issue_id: 28, created_at: '2026-05-14T10:00:00Z' },

  // Contributor B: 5 applications
  { contributor: CONTRIBUTORS.B, org_id: 'stellar', issue_id: 1, created_at: '2026-05-02T11:00:00Z' },
  { contributor: CONTRIBUTORS.B, org_id: 'soroban-governor', issue_id: 7, created_at: '2026-05-04T12:00:00Z' },
  { contributor: CONTRIBUTORS.B, org_id: 'wave-builders', issue_id: 14, created_at: '2026-05-06T13:00:00Z' },
  { contributor: CONTRIBUTORS.B, org_id: 'defi-alliance', issue_id: 19, created_at: '2026-05-08T14:00:00Z' },
  { contributor: CONTRIBUTORS.B, org_id: 'open-tools', issue_id: 25, created_at: '2026-05-10T15:00:00Z' },

  // Contributor C: 10 applications
  { contributor: CONTRIBUTORS.C, org_id: 'stellar', issue_id: 4, created_at: '2026-05-01T12:00:00Z' },
  { contributor: CONTRIBUTORS.C, org_id: 'stellar', issue_id: 5, created_at: '2026-05-02T12:00:00Z' },
  { contributor: CONTRIBUTORS.C, org_id: 'soroban-governor', issue_id: 9, created_at: '2026-05-03T12:00:00Z' },
  { contributor: CONTRIBUTORS.C, org_id: 'soroban-governor', issue_id: 10, created_at: '2026-05-04T12:00:00Z' },
  { contributor: CONTRIBUTORS.C, org_id: 'wave-builders', issue_id: 16, created_at: '2026-05-05T12:00:00Z' },
  { contributor: CONTRIBUTORS.C, org_id: 'wave-builders', issue_id: 17, created_at: '2026-05-06T12:00:00Z' },
  { contributor: CONTRIBUTORS.C, org_id: 'defi-alliance', issue_id: 22, created_at: '2026-05-07T12:00:00Z' },
  { contributor: CONTRIBUTORS.C, org_id: 'defi-alliance', issue_id: 23, created_at: '2026-05-08T12:00:00Z' },
  { contributor: CONTRIBUTORS.C, org_id: 'open-tools', issue_id: 28, created_at: '2026-05-09T12:00:00Z' },
  { contributor: CONTRIBUTORS.C, org_id: 'open-tools', issue_id: 29, created_at: '2026-05-10T12:00:00Z' },

  // Contributor D: 7 applications
  { contributor: CONTRIBUTORS.D, org_id: 'stellar', issue_id: 1, created_at: '2026-05-03T09:00:00Z' },
  { contributor: CONTRIBUTORS.D, org_id: 'stellar', issue_id: 5, created_at: '2026-05-04T09:00:00Z' },
  { contributor: CONTRIBUTORS.D, org_id: 'soroban-governor', issue_id: 7, created_at: '2026-05-05T09:00:00Z' },
  { contributor: CONTRIBUTORS.D, org_id: 'wave-builders', issue_id: 14, created_at: '2026-05-06T09:00:00Z' },
  { contributor: CONTRIBUTORS.D, org_id: 'defi-alliance', issue_id: 19, created_at: '2026-05-07T09:00:00Z' },
  { contributor: CONTRIBUTORS.D, org_id: 'defi-alliance', issue_id: 22, created_at: '2026-05-08T09:00:00Z' },
  { contributor: CONTRIBUTORS.D, org_id: 'open-tools', issue_id: 25, created_at: '2026-05-09T09:00:00Z' },

  // Contributor E: 5 applications
  { contributor: CONTRIBUTORS.E, org_id: 'stellar', issue_id: 4, created_at: '2026-05-04T14:00:00Z' },
  { contributor: CONTRIBUTORS.E, org_id: 'soroban-governor', issue_id: 9, created_at: '2026-05-05T14:00:00Z' },
  { contributor: CONTRIBUTORS.E, org_id: 'wave-builders', issue_id: 16, created_at: '2026-05-06T14:00:00Z' },
  { contributor: CONTRIBUTORS.E, org_id: 'defi-alliance', issue_id: 23, created_at: '2026-05-07T14:00:00Z' },
  { contributor: CONTRIBUTORS.E, org_id: 'open-tools', issue_id: 28, created_at: '2026-05-08T14:00:00Z' },

  // Contributor F: 3 applications
  { contributor: CONTRIBUTORS.F, org_id: 'stellar', issue_id: 1, created_at: '2026-05-05T15:00:00Z' },
  { contributor: CONTRIBUTORS.F, org_id: 'wave-builders', issue_id: 14, created_at: '2026-05-06T15:00:00Z' },
  { contributor: CONTRIBUTORS.F, org_id: 'open-tools', issue_id: 25, created_at: '2026-05-07T15:00:00Z' },

  // Contributor G: 2 applications
  { contributor: CONTRIBUTORS.G, org_id: 'soroban-governor', issue_id: 7, created_at: '2026-05-06T16:00:00Z' },
  { contributor: CONTRIBUTORS.G, org_id: 'defi-alliance', issue_id: 19, created_at: '2026-05-07T16:00:00Z' },

  // Contributor H: 1 application
  { contributor: CONTRIBUTORS.H, org_id: 'open-tools', issue_id: 29, created_at: '2026-05-08T17:00:00Z' },

  // Contributor J: 1 application
  { contributor: CONTRIBUTORS.J, org_id: 'stellar', issue_id: 5, created_at: '2026-05-09T18:00:00Z' },
];

// ─── Assignments ────────────────────────────────────────────────────────────

export const MOCK_ASSIGNMENTS: readonly MockAssignmentSeed[] = [
  // Contributor A: 1 assignment
  { contributor: CONTRIBUTORS.A, org_id: 'stellar', issue_id: 2, created_at: '2026-04-16T12:00:00Z' },

  // Contributor B: 3 assignments (Contributor B with 3 assignments)
  { contributor: CONTRIBUTORS.B, org_id: 'stellar', issue_id: 3, created_at: '2026-04-21T10:00:00Z' },
  { contributor: CONTRIBUTORS.B, org_id: 'soroban-governor', issue_id: 8, created_at: '2026-04-26T11:00:00Z' },
  { contributor: CONTRIBUTORS.B, org_id: 'wave-builders', issue_id: 13, created_at: '2026-04-27T12:00:00Z' },

  // Contributor C: 2 assignments
  { contributor: CONTRIBUTORS.C, org_id: 'wave-builders', issue_id: 15, created_at: '2026-05-04T09:00:00Z' },
  { contributor: CONTRIBUTORS.C, org_id: 'defi-alliance', issue_id: 20, created_at: '2026-05-05T10:00:00Z' },

  // Contributor D: 1 assignment
  { contributor: CONTRIBUTORS.D, org_id: 'defi-alliance', issue_id: 21, created_at: '2026-05-05T14:00:00Z' },

  // Contributor E: 2 assignments
  { contributor: CONTRIBUTORS.E, org_id: 'soroban-governor', issue_id: 11, created_at: '2026-05-09T11:00:00Z' },
  { contributor: CONTRIBUTORS.E, org_id: 'open-tools', issue_id: 26, created_at: '2026-05-10T12:00:00Z' },

  // Contributor F: 1 assignment
  { contributor: CONTRIBUTORS.F, org_id: 'open-tools', issue_id: 27, created_at: '2026-05-06T13:00:00Z' },

  // Contributor H: 1 assignment
  { contributor: CONTRIBUTORS.H, org_id: 'stellar', issue_id: 2, created_at: '2026-04-18T15:00:00Z' },

  // Contributor I: 2 assignments
  { contributor: CONTRIBUTORS.I, org_id: 'wave-builders', issue_id: 13, created_at: '2026-04-29T16:00:00Z' },
  { contributor: CONTRIBUTORS.I, org_id: 'defi-alliance', issue_id: 20, created_at: '2026-05-06T17:00:00Z' },
];

// ─── Historical Events (Charts & Timeline Feeds) ─────────────────────────────

export const MOCK_EVENTS: readonly MockEventSeed[] = [
  { org_id: 'stellar', event_type: 'completed', issue_id: '6', contributor: CONTRIBUTORS.A, tx_hash: 'tx_c10001', occurred_at: '2026-03-05T10:00:00Z' },
  { org_id: 'soroban-governor', event_type: 'completed', issue_id: '12', contributor: CONTRIBUTORS.B, tx_hash: 'tx_c10002', occurred_at: '2026-03-18T11:00:00Z' },
  { org_id: 'wave-builders', event_type: 'completed', issue_id: '18', contributor: CONTRIBUTORS.C, tx_hash: 'tx_c10003', occurred_at: '2026-03-24T12:00:00Z' },
  { org_id: 'defi-alliance', event_type: 'completed', issue_id: '24', contributor: CONTRIBUTORS.D, tx_hash: 'tx_c10004', occurred_at: '2026-03-29T13:00:00Z' },
  { org_id: 'open-tools', event_type: 'completed', issue_id: '30', contributor: CONTRIBUTORS.E, tx_hash: 'tx_c10005', occurred_at: '2026-04-02T14:00:00Z' },
  { org_id: 'stellar', event_type: 'applied', issue_id: '1', contributor: CONTRIBUTORS.A, tx_hash: 'tx_c10006', occurred_at: '2026-05-01T10:00:00Z' },
  { org_id: 'stellar', event_type: 'assigned', issue_id: '2', contributor: CONTRIBUTORS.A, tx_hash: 'tx_c10007', occurred_at: '2026-04-16T12:00:00Z' },
  { org_id: 'soroban-governor', event_type: 'assigned', issue_id: '8', contributor: CONTRIBUTORS.B, tx_hash: 'tx_c10008', occurred_at: '2026-04-26T11:00:00Z' },
  { org_id: 'wave-builders', event_type: 'assigned', issue_id: '13', contributor: CONTRIBUTORS.B, tx_hash: 'tx_c10009', occurred_at: '2026-04-27T12:00:00Z' },
  { org_id: 'wave-builders', event_type: 'withdrawn', issue_id: '17', contributor: CONTRIBUTORS.F, tx_hash: 'tx_c10010', occurred_at: '2026-04-28T14:00:00Z' },
];

export const MOCK_CONTRACT_EVENTS: readonly MockContractEventSeed[] = [
  { event_type: 'completed', contributor: CONTRIBUTORS.A, org_id: 'stellar', issue_id: 6, tx_hash: '0xabc1', event_index: 0, ledger_seq: 100010, timestamp: '2026-03-05T10:00:00Z' },
  { event_type: 'completed', contributor: CONTRIBUTORS.B, org_id: 'soroban-governor', issue_id: 12, tx_hash: '0xabc2', event_index: 0, ledger_seq: 100050, timestamp: '2026-03-18T11:00:00Z' },
  { event_type: 'completed', contributor: CONTRIBUTORS.C, org_id: 'wave-builders', issue_id: 18, tx_hash: '0xabc3', event_index: 0, ledger_seq: 100090, timestamp: '2026-03-24T12:00:00Z' },
  { event_type: 'completed', contributor: CONTRIBUTORS.D, org_id: 'defi-alliance', issue_id: 24, tx_hash: '0xabc4', event_index: 0, ledger_seq: 100130, timestamp: '2026-03-29T13:00:00Z' },
  { event_type: 'completed', contributor: CONTRIBUTORS.E, org_id: 'open-tools', issue_id: 30, tx_hash: '0xabc5', event_index: 0, ledger_seq: 100170, timestamp: '2026-04-02T14:00:00Z' },
  { event_type: 'applied', contributor: CONTRIBUTORS.A, org_id: 'stellar', issue_id: 1, tx_hash: '0xabc6', event_index: 0, ledger_seq: 100200, timestamp: '2026-05-01T10:00:00Z' },
  { event_type: 'assigned', contributor: CONTRIBUTORS.A, org_id: 'stellar', issue_id: 2, tx_hash: '0xabc7', event_index: 0, ledger_seq: 100220, timestamp: '2026-04-16T12:00:00Z' },
  { event_type: 'assigned', contributor: CONTRIBUTORS.B, org_id: 'soroban-governor', issue_id: 8, tx_hash: '0xabc8', event_index: 0, ledger_seq: 100240, timestamp: '2026-04-26T11:00:00Z' },
  { event_type: 'assigned', contributor: CONTRIBUTORS.B, org_id: 'wave-builders', issue_id: 13, tx_hash: '0xabc9', event_index: 0, ledger_seq: 100260, timestamp: '2026-04-27T12:00:00Z' },
  { event_type: 'withdrawn', contributor: CONTRIBUTORS.F, org_id: 'wave-builders', issue_id: 17, tx_hash: '0xabca', event_index: 0, ledger_seq: 100280, timestamp: '2026-04-28T14:00:00Z' },
];

/**
 * Seeds the database with mock organizations, maintainers, 30 tagged issues,
 * contributors across realistic workload states, and timeline activity records.
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

    // 1. Seed Organizations
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

    // 2. Seed Maintainers
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

    // 3. Seed 30 Issues and Labels
    let issuesInserted = 0;
    let labelsInserted = 0;
    for (const issue of MOCK_ISSUES) {
      const res = await client.query(
        `INSERT INTO issues (id, org_id, title, status, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE
           SET org_id = EXCLUDED.org_id,
               title = EXCLUDED.title,
               status = EXCLUDED.status,
               created_at = EXCLUDED.created_at`,
        [issue.id, issue.org_id, issue.title, issue.status, issue.created_at],
      );
      issuesInserted += res.rowCount ?? 0;

      for (const label of issue.labels) {
        const labelRes = await client.query(
          `INSERT INTO github_issue_labels (org_id, issue_id, label_name)
           VALUES ($1, $2, $3)
           ON CONFLICT (org_id, issue_id, label_name) DO NOTHING`,
          [issue.org_id, issue.id, label],
        );
        labelsInserted += labelRes.rowCount ?? 0;
      }
    }

    // 4. Seed Applications (Workload state)
    let applicationsInserted = 0;
    for (const app of MOCK_APPLICATIONS) {
      const res = await client.query(
        `INSERT INTO applications (contributor, org_id, issue_id, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (contributor, org_id, issue_id) DO NOTHING`,
        [app.contributor, app.org_id, app.issue_id, app.created_at],
      );
      applicationsInserted += res.rowCount ?? 0;
    }

    // 5. Seed Assignments
    let assignmentsInserted = 0;
    for (const asgn of MOCK_ASSIGNMENTS) {
      const res = await client.query(
        `INSERT INTO assignments (contributor, org_id, issue_id, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (contributor, org_id, issue_id) DO NOTHING`,
        [asgn.contributor, asgn.org_id, asgn.issue_id, asgn.created_at],
      );
      assignmentsInserted += res.rowCount ?? 0;
    }

    // 6. Seed Historical Events
    let eventsInserted = 0;
    for (const ev of MOCK_EVENTS) {
      const res = await client.query(
        `INSERT INTO events (org_id, event_type, issue_id, contributor, tx_hash, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [ev.org_id, ev.event_type, ev.issue_id, ev.contributor, ev.tx_hash, ev.occurred_at],
      );
      eventsInserted += res.rowCount ?? 0;
    }

    let contractEventsInserted = 0;
    for (const cev of MOCK_CONTRACT_EVENTS) {
      const res = await client.query(
        `INSERT INTO contract_events (event_type, contributor, org_id, issue_id, tx_hash, event_index, ledger_seq, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [cev.event_type, cev.contributor, cev.org_id, cev.issue_id, cev.tx_hash, cev.event_index, cev.ledger_seq, cev.timestamp],
      );
      contractEventsInserted += res.rowCount ?? 0;
    }

    await client.query('COMMIT');

    return {
      orgs: orgsInserted,
      maintainers: maintainersInserted,
      issues: issuesInserted,
      labels: labelsInserted,
      applications: applicationsInserted,
      assignments: assignmentsInserted,
      events: eventsInserted,
      contractEvents: contractEventsInserted,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  const startTime = Date.now();
  seedMockData()
    .then((summary) => {
      const elapsedMs = Date.now() - startTime;
      console.log(`[db:seed] Mock data seeded successfully in ${elapsedMs}ms:`, summary);
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
