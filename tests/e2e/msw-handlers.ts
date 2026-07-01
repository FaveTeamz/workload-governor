/**
 * MSW request handlers for Playwright E2E tests.
 * Injected via page.addInitScript so MSW intercepts fetch in the browser.
 *
 * Covers: /api/issues, /api/contributors/:addr/counts
 */

import { http, HttpResponse } from 'msw';
import type { Issue, Counts } from './types';

export const MOCK_CONTRIBUTOR =
  'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBWE3ITMG4YOS';
export const MOCK_MAINTAINER =
  'GBMAINTAINER000000000000000000000000000000000000000000000002';

export const GLOBAL_CAP = 15;

/** Mutable state shared across handlers in a single test. */
export const state = {
  applications: 0 as number,
  issues: [
    { id: 1, org_id: 'stellar-org', title: 'Fix TTL extension bug', status: 'open' },
    { id: 2, org_id: 'stellar-org', title: 'Add prop tests', status: 'open' },
  ] as Issue[],
};

export function resetState() {
  state.applications = 0;
  state.issues = [
    { id: 1, org_id: 'stellar-org', title: 'Fix TTL extension bug', status: 'open' },
    { id: 2, org_id: 'stellar-org', title: 'Add prop tests', status: 'open' },
  ];
}

export function makeHandlers(overrides: { applications?: number } = {}) {
  if (overrides.applications !== undefined) state.applications = overrides.applications;

  return [
    // List issues
    http.get('/api/issues', () =>
      HttpResponse.json({
        issues: state.issues,
        total: state.issues.length,
        page: 1,
        limit: 10,
        totalPages: 1,
      }),
    ),

    // Apply for issue
    http.post('/api/transactions/apply', () => {
      state.applications++;
      return HttpResponse.json({ xdr: 'AAAA==', fee: '100', instructions: 0, readBytes: 0, writeBytes: 0 });
    }),

    // Contributor counts
    http.get(`/api/contributors/${MOCK_CONTRIBUTOR}/counts`, () => {
      const counts: Counts = {
        totalApplications: state.applications,
        totalAssignments: 0,
        byOrganization: [],
      };
      return HttpResponse.json(counts);
    }),

    // Generic contributor counts (for cap-exceeded flow)
    http.get('/api/contributors/:address/counts', ({ params }) => {
      void params;
      const counts: Counts = {
        totalApplications: state.applications,
        totalAssignments: 0,
        byOrganization: [],
      };
      return HttpResponse.json(counts);
    }),
  ];
}
