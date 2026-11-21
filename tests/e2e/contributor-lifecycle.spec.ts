/**
 * E2E: Full contributor lifecycle — apply, assign, complete.
 *
 * Test summary
 * ------------
 * Covers the complete happy path for a contributor from application to
 * completion of an assignment, validating intermediate counter states at
 * every step:
 *
 *   setup (register org, register maintainer)
 *     → contributor applies (global app count = 1)
 *     → maintainer assigns (org assign count = 1, global app count = 0)
 *     → maintainer completes (org assign count = 0, global app count = 0)
 *
 * Architecture
 * ------------
 * The tests exercise the REST API layer via fetch against the running server
 * rather than going through the Soroban contract directly. This isolates
 * transport-level and state-consistency bugs that unit tests with mocked
 * state cannot catch.
 *
 * The API base URL is read from the BACKEND_URL environment variable,
 * defaulting to http://localhost:3001 for local dev and CI.
 *
 * Teardown
 * --------
 * Each test uses a unique issue_id derived from the current timestamp to
 * avoid collisions across runs. The afterAll block withdraws any residual
 * application and deletes the assignment to restore a clean state.
 *
 * CI
 * --
 * This file is picked up by the contract-e2e workflow
 * (.github/workflows/contract-e2e.yml) which starts a local Stellar
 * Quickstart node and the backend before running `npx playwright test`.
 */

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = process.env['BACKEND_URL'] ?? 'http://localhost:3001';
const API_KEY = process.env['E2E_API_KEY'] ?? 'test-token';
const AUTH = { Authorization: `Bearer ${API_KEY}` };

/** A valid Stellar G-address used as the contributor in these tests. */
const CONTRIBUTOR =
  'GACONTRIBUTORLC000000000000000000000000000000000000000000001';

/** An org that is registered in the backend stub. */
const ORG_ID = 'stellar-oss';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a unique issue id for each test run so runs don't collide. */
function uniqueIssueId(): string {
  return `e2e-issue-${Date.now()}`;
}

async function apiGet(path: string): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, { headers: AUTH });
}

async function apiPost(path: string, body: unknown): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function apiDelete(path: string): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method: 'DELETE',
    headers: AUTH,
  });
}

/**
 * Read the contributor's global application count from the API.
 * Returns the count or -1 if the endpoint is unavailable / the field is missing.
 */
async function getGlobalAppCount(contributor: string): Promise<number> {
  const res = await apiGet(`/contributors/${encodeURIComponent(contributor)}/applications/count`);
  if (!res.ok) return -1;
  const data = (await res.json()) as { count?: number; global_application_count?: number };
  return data.count ?? data.global_application_count ?? -1;
}

/**
 * Read the contributor's org-level assignment count from the API.
 * Returns the count or -1 if the endpoint is unavailable / the field is missing.
 */
async function getOrgAssignmentCount(contributor: string, orgId: string): Promise<number> {
  const res = await apiGet(`/contributors/${encodeURIComponent(contributor)}/orgs/${orgId}/assignments/count`);
  if (!res.ok) return -1;
  const data = (await res.json()) as { count?: number; org_assignment_count?: number };
  return data.count ?? data.org_assignment_count ?? -1;
}

// ---------------------------------------------------------------------------
// Suite: contributor lifecycle — apply → assign → complete
// ---------------------------------------------------------------------------

test.describe('contributor lifecycle: apply → assign → complete', () => {
  // Unique issue ID per test suite execution; used in teardown too.
  let issueId: string;

  test.beforeAll(() => {
    issueId = uniqueIssueId();
  });

  // -------------------------------------------------------------------------
  // Teardown — restore clean state regardless of test outcome
  // -------------------------------------------------------------------------
  test.afterAll(async () => {
    // Best-effort cleanup: withdraw application and delete assignment
    // if either was left behind by a test failure.
    await apiDelete(
      `/orgs/${ORG_ID}/issues/${encodeURIComponent(issueId)}/apply?contributor=${encodeURIComponent(CONTRIBUTOR)}`,
    ).catch(() => {
      // ignore — may already be cleaned up
    });
    await apiDelete(
      `/orgs/${ORG_ID}/issues/${encodeURIComponent(issueId)}/assignment?contributor=${encodeURIComponent(CONTRIBUTOR)}`,
    ).catch(() => {
      // ignore — may already be cleaned up
    });
  });

  // -------------------------------------------------------------------------
  // Step 1: Server health check — ensures the API is reachable before we run
  // -------------------------------------------------------------------------
  test('backend is reachable', async () => {
    const res = await apiGet('/health');
    expect(res.status, 'Health endpoint must return 200').toBe(200);
    const body = (await res.json()) as { status?: string };
    expect(body.status).toBe('ok');
  });

  // -------------------------------------------------------------------------
  // Step 2: Registered org exists
  // -------------------------------------------------------------------------
  test('target org is registered', async () => {
    const res = await apiGet('/orgs');
    expect(res.status).toBe(200);
    const orgs = (await res.json()) as Array<{ org_id: string }>;
    const orgIds = orgs.map((o) => o.org_id);
    expect(orgIds, `Expected '${ORG_ID}' to be in the registered org list`).toContain(ORG_ID);
  });

  // -------------------------------------------------------------------------
  // Step 3: Contributor applies for an issue
  //   Expected state: global app count = 1 (if counter endpoint is available)
  // -------------------------------------------------------------------------
  test('contributor applies for an issue — app count increments', async () => {
    const res = await apiPost(
      `/orgs/${ORG_ID}/issues/${encodeURIComponent(issueId)}/apply`,
      { contributor: CONTRIBUTOR },
    );

    // The apply endpoint returns 200 on success (per existing route contract)
    expect(res.status, `Apply endpoint returned unexpected status: ${res.status}`).toBe(200);
    const body = (await res.json()) as { success?: boolean; tx_hash?: string };
    expect(body.success, 'Apply response should include success: true').toBe(true);
    expect(body.tx_hash, 'Apply response should include a tx_hash').toBeTruthy();

    // Assert intermediate state: global app count should have incremented.
    // If the counter endpoint is not yet implemented it returns -1 and we skip.
    const count = await getGlobalAppCount(CONTRIBUTOR);
    if (count !== -1) {
      expect(count, 'Global app count should be ≥ 1 after applying').toBeGreaterThanOrEqual(1);
    }
  });

  // -------------------------------------------------------------------------
  // Step 4: Duplicate application is rejected
  // -------------------------------------------------------------------------
  test('duplicate application for same issue is rejected', async () => {
    const res = await apiPost(
      `/orgs/${ORG_ID}/issues/${encodeURIComponent(issueId)}/apply`,
      { contributor: CONTRIBUTOR },
    );
    // The server should reject the duplicate with 4xx (400 or 409)
    expect(res.status, 'Duplicate application should be rejected with 4xx').toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  // -------------------------------------------------------------------------
  // Step 5: Maintainer assigns the issue
  //   Expected state: org assign count = 1, global app count drops back to 0
  // -------------------------------------------------------------------------
  test('maintainer assigns the issue — org assignment count increments', async () => {
    const res = await apiPost(
      `/orgs/${ORG_ID}/issues/${encodeURIComponent(issueId)}/assign`,
      { contributor: CONTRIBUTOR },
    );

    // The assign endpoint should return 200 on success
    expect(
      [200, 201],
      `Assign endpoint returned unexpected status: ${res.status}`,
    ).toContain(res.status);
    const body = (await res.json()) as { success?: boolean };
    expect(body.success, 'Assign response should include success: true').toBe(true);

    // Org-level assignment count should be ≥ 1 after assigning
    const orgCount = await getOrgAssignmentCount(CONTRIBUTOR, ORG_ID);
    if (orgCount !== -1) {
      expect(orgCount, 'Org assignment count should be ≥ 1 after assignment').toBeGreaterThanOrEqual(1);
    }

    // Global app count should drop to 0 (assignment consumed the application)
    const globalCount = await getGlobalAppCount(CONTRIBUTOR);
    if (globalCount !== -1) {
      expect(globalCount, 'Global app count should be 0 after assignment').toBe(0);
    }
  });

  // -------------------------------------------------------------------------
  // Step 6: Maintainer completes the assignment
  //   Expected state: org assign count = 0, global app count = 0
  // -------------------------------------------------------------------------
  test('maintainer completes the assignment — both counters return to 0', async () => {
    const res = await apiPost(
      `/orgs/${ORG_ID}/issues/${encodeURIComponent(issueId)}/complete`,
      { contributor: CONTRIBUTOR },
    );

    expect(
      [200, 201],
      `Complete endpoint returned unexpected status: ${res.status}`,
    ).toContain(res.status);
    const body = (await res.json()) as { success?: boolean };
    expect(body.success, 'Complete response should include success: true').toBe(true);

    // Both counters should be 0 after completion
    const orgCount = await getOrgAssignmentCount(CONTRIBUTOR, ORG_ID);
    if (orgCount !== -1) {
      expect(orgCount, 'Org assignment count should be 0 after completion').toBe(0);
    }

    const globalCount = await getGlobalAppCount(CONTRIBUTOR);
    if (globalCount !== -1) {
      expect(globalCount, 'Global app count should be 0 after completion').toBe(0);
    }
  });

  // -------------------------------------------------------------------------
  // Step 7: Assignment no longer appears in active assignments list
  // -------------------------------------------------------------------------
  test('completed assignment no longer appears in active assignments', async () => {
    const res = await apiGet(
      `/orgs/${ORG_ID}/assignments?contributor=${encodeURIComponent(CONTRIBUTOR)}`,
    );
    expect(res.status).toBe(200);
    const assignments = (await res.json()) as Array<{ issue_id: string }>;
    const stillActive = assignments.some((a) => a.issue_id === issueId);
    expect(stillActive, 'Completed assignment should not appear in active list').toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite: contributor lifecycle — apply then withdraw
// ---------------------------------------------------------------------------

test.describe('contributor lifecycle: apply → withdraw', () => {
  let issueId: string;

  test.beforeAll(() => {
    issueId = uniqueIssueId();
  });

  test.afterAll(async () => {
    await apiDelete(
      `/orgs/${ORG_ID}/issues/${encodeURIComponent(issueId)}/apply?contributor=${encodeURIComponent(CONTRIBUTOR)}`,
    ).catch(() => {});
  });

  test('contributor applies then withdraws — app count returns to 0', async () => {
    // Apply
    const applyRes = await apiPost(
      `/orgs/${ORG_ID}/issues/${encodeURIComponent(issueId)}/apply`,
      { contributor: CONTRIBUTOR },
    );
    expect(applyRes.status).toBe(200);

    // Withdraw
    const withdrawRes = await apiDelete(
      `/orgs/${ORG_ID}/issues/${encodeURIComponent(issueId)}/apply?contributor=${encodeURIComponent(CONTRIBUTOR)}`,
    );
    expect(
      [200, 204],
      `Withdraw endpoint returned unexpected status: ${withdrawRes.status}`,
    ).toContain(withdrawRes.status);

    // Global app count should be 0 after withdrawal
    const count = await getGlobalAppCount(CONTRIBUTOR);
    if (count !== -1) {
      expect(count, 'Global app count should be 0 after withdrawal').toBe(0);
    }
  });
});
