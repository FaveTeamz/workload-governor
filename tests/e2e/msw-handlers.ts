/**
 * MSW request handlers for Playwright E2E tests.
 * Injected via page.addInitScript so MSW intercepts fetch in the browser.
 *
 * Covers: /api/issues, /api/contributors/:addr/counts,
 *         /api/transactions/apply, /api/transactions/assign,
 *         /api/transactions/complete, /api/transactions/revoke,
 *         /api/maintainers/:maintainer/orgs/:orgId/applications,
 *         /api/maintainers/:maintainer/orgs/:orgId/assignments
 */

import { http, HttpResponse } from 'msw';
import type { Issue, Counts } from './types';

export const MOCK_CONTRIBUTOR =
  'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBWE3ITMG4YOS';
export const MOCK_MAINTAINER =
  'GBMAINTAINER000000000000000000000000000000000000000000000002';

export const GLOBAL_CAP = 15;

/** A work item as used by the maintainer views. */
export interface WorkItem {
  contributor: string;
  issueId: string;
  date: string; // ISO string
  type: 'application' | 'assignment';
}

/** Mutable state shared across handlers in a single test. */
export const state = {
  applications: 0 as number,
  issues: [
    { id: 1, org_id: 'stellar-org', title: 'Fix TTL extension bug', status: 'open' },
    { id: 2, org_id: 'stellar-org', title: 'Add prop tests', status: 'open' },
  ] as Issue[],
  /** Pending applications visible in the maintainer dashboard. */
  pendingItems: [
    {
      contributor: MOCK_CONTRIBUTOR,
      issueId: 'issue-1',
      date: '2026-06-20T00:00:00.000Z',
      type: 'application' as const,
    },
    {
      contributor: 'GACONTRIBUTOR000000000000000000000000000000000000000000000002',
      issueId: 'issue-2',
      date: '2026-06-21T00:00:00.000Z',
      type: 'application' as const,
    },
  ] as WorkItem[],
  /** Active assignments visible in the maintainer dashboard. */
  assignedItems: [
    {
      contributor: MOCK_CONTRIBUTOR,
      issueId: 'issue-99',
      date: '2026-06-15T00:00:00.000Z',
      type: 'assignment' as const,
    },
  ] as WorkItem[],
};

export function resetState() {
  state.applications = 0;
  state.issues = [
    { id: 1, org_id: 'stellar-org', title: 'Fix TTL extension bug', status: 'open' },
    { id: 2, org_id: 'stellar-org', title: 'Add prop tests', status: 'open' },
  ];
  state.pendingItems = [
    {
      contributor: MOCK_CONTRIBUTOR,
      issueId: 'issue-1',
      date: '2026-06-20T00:00:00.000Z',
      type: 'application',
    },
    {
      contributor: 'GACONTRIBUTOR000000000000000000000000000000000000000000000002',
      issueId: 'issue-2',
      date: '2026-06-21T00:00:00.000Z',
      type: 'application',
    },
  ];
  state.assignedItems = [
    {
      contributor: MOCK_CONTRIBUTOR,
      issueId: 'issue-99',
      date: '2026-06-15T00:00:00.000Z',
      type: 'assignment',
    },
  ];
}

export function makeHandlers(overrides: { applications?: number } = {}) {
  if (overrides.applications !== undefined) state.applications = overrides.applications;

  return [
    // ------------------------------------------------------------------
    // Issues list
    // ------------------------------------------------------------------
    http.get('/api/issues', () =>
      HttpResponse.json({
        issues: state.issues,
        total: state.issues.length,
        page: 1,
        limit: 10,
        totalPages: 1,
      }),
    ),

    // ------------------------------------------------------------------
    // Contributor stats
    // ------------------------------------------------------------------
    http.get(`/api/contributors/${MOCK_CONTRIBUTOR}/counts`, () => {
      const counts: Counts = {
        totalApplications: state.applications,
        totalAssignments: 0,
        byOrganization: [],
      };
      return HttpResponse.json(counts);
    }),

    // Generic wildcard contributor counts (for cap-exceeded flow)
    http.get('/api/contributors/:address/counts', ({ params }) => {
      void params;
      const counts: Counts = {
        totalApplications: state.applications,
        totalAssignments: 0,
        byOrganization: [],
      };
      return HttpResponse.json(counts);
    }),

    // ------------------------------------------------------------------
    // Contributor transactions
    // ------------------------------------------------------------------

    // Apply for issue
    http.post('/api/transactions/apply', () => {
      state.applications++;
      return HttpResponse.json({
        xdr: 'AAAA==',
        fee: '100',
        instructions: 0,
        readBytes: 0,
        writeBytes: 0,
      });
    }),

    // Withdraw application
    http.post('/api/transactions/withdraw', () => {
      state.applications = Math.max(0, state.applications - 1);
      return HttpResponse.json({
        xdr: 'AAAA==',
        fee: '100',
        instructions: 0,
        readBytes: 0,
        writeBytes: 0,
      });
    }),

    // ------------------------------------------------------------------
    // Maintainer transactions
    // ------------------------------------------------------------------

    /**
     * Assign issue: moves an item from pendingItems to assignedItems.
     * Body: { maintainer, contributor, org_id, issue_id }
     */
    http.post('/api/transactions/assign', async ({ request }) => {
      const body = (await request.json()) as {
        maintainer: string;
        contributor: string;
        org_id: string;
        issue_id: string;
      };

      // Remove from pending
      state.pendingItems = state.pendingItems.filter(
        (i) => !(i.contributor === body.contributor && i.issueId === body.issue_id),
      );

      // Add to assigned
      state.assignedItems.push({
        contributor: body.contributor,
        issueId: body.issue_id,
        date: new Date().toISOString(),
        type: 'assignment',
      });

      return HttpResponse.json({
        xdr: 'AAAA==',
        fee: '100',
        instructions: 0,
        readBytes: 0,
        writeBytes: 0,
      });
    }),

    /**
     * Complete assignment: removes item from assignedItems.
     * Body: { maintainer, contributor, org_id, issue_id }
     */
    http.post('/api/transactions/complete', async ({ request }) => {
      const body = (await request.json()) as {
        maintainer: string;
        contributor: string;
        org_id: string;
        issue_id: string;
      };

      state.assignedItems = state.assignedItems.filter(
        (i) => !(i.contributor === body.contributor && i.issueId === body.issue_id),
      );

      return HttpResponse.json({
        xdr: 'AAAA==',
        fee: '100',
        instructions: 0,
        readBytes: 0,
        writeBytes: 0,
      });
    }),

    /**
     * Revoke assignment: removes item from assignedItems.
     * Body: { maintainer, contributor, org_id, issue_id }
     */
    http.post('/api/transactions/revoke', async ({ request }) => {
      const body = (await request.json()) as {
        maintainer: string;
        contributor: string;
        org_id: string;
        issue_id: string;
      };

      state.assignedItems = state.assignedItems.filter(
        (i) => !(i.contributor === body.contributor && i.issueId === body.issue_id),
      );

      return HttpResponse.json({
        xdr: 'AAAA==',
        fee: '100',
        instructions: 0,
        readBytes: 0,
        writeBytes: 0,
      });
    }),

    // ------------------------------------------------------------------
    // Maintainer dashboard data queries
    // ------------------------------------------------------------------

    /**
     * List pending applications for an org.
     * Used by MaintainerDashboard's fetchItems prop.
     */
    http.get('/api/maintainers/:maintainer/orgs/:orgId/applications', ({ params }) => {
      void params;
      return HttpResponse.json({ items: state.pendingItems });
    }),

    /**
     * List active assignments for an org.
     * Used by MaintainerDashboard's fetchItems prop.
     */
    http.get('/api/maintainers/:maintainer/orgs/:orgId/assignments', ({ params }) => {
      void params;
      return HttpResponse.json({ items: state.assignedItems });
    }),

    /**
     * Combined work items (applications + assignments) for MaintainerDashboard.
     * fetchItems callback queries this shape.
     */
    http.get('/api/maintainers/:maintainer/orgs/:orgId/items', ({ params }) => {
      void params;
      return HttpResponse.json({
        items: [...state.pendingItems, ...state.assignedItems],
      });
    }),
  ];
}
