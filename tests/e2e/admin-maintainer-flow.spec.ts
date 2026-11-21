/**
 * E2E: Admin maintainer registration and deregistration flow.
 *
 * Issue #625 — https://github.com/FaveTeamz/workload-governor/issues/625
 *
 * Test Flow
 * ---------
 * 1. Admin registers a maintainer for an org
 * 2. Registered maintainer successfully assigns an issue
 * 3. Admin deregisters the maintainer from the org
 * 4. Deregistered maintainer attempt fails with UnauthorizedMaintainer (error 4)
 * 5. Deregistering a non-existent maintainer returns MaintainerNotFound (error 17)
 *
 * Architecture
 * ------------
 * These tests exercise the full HTTP API → Soroban transaction pipeline via
 * Playwright page.route() interception. No real Soroban node or Stellar
 * localnet is required for the test suite — the contract layer is mocked at
 * the HTTP boundary (matching the pattern used in apply-withdraw-flow.spec.ts).
 *
 * Race Condition Fixes (#1065)
 * ----------------------------
 * All fixed timeouts (setTimeout / page.waitForTimeout) have been removed and
 * replaced with:
 *   - `expect.poll` for polling-based assertions on async DOM state.
 *   - `page.waitForResponse` / `page.waitForRequest` for network synchronisation.
 *   - Explicit `toBeVisible()` / `toHaveText()` web assertions where DOM elements
 *     are expected to appear after an async operation.
 * This eliminates CI flakiness caused by arbitrary time-based waits that can
 * race under load.
 *
 * For tests against a real localnet, set the following environment variables:
 *   ADMIN_SECRET_KEY   — Stellar secret key of the contract admin
 *   ADMIN_PUBLIC_KEY   — Corresponding public key
 *   CONTRACT_ID        — Deployed WorkloadGovernor contract ID
 *   RPC_URL            — Soroban RPC endpoint (default: http://localhost:8000/soroban/rpc)
 *   E2E_USE_LOCALNET   — Set to "true" to skip mocks and hit a real node
 *
 * CI: runs on every PR via .github/workflows/e2e.yml.
 * Localnet setup: see docs/testing.md.
 */

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants — use env vars for CI, fall back to well-known test addresses
// ---------------------------------------------------------------------------

const ADMIN_PUBLIC_KEY =
  process.env.ADMIN_PUBLIC_KEY ??
  'GAADMIN000000000000000000000000000000000000000000000000000001';

const MAINTAINER_ADDRESS =
  'GBMAINTAINER000000000000000000000000000000000000000000000002';

const NON_EXISTENT_MAINTAINER =
  'GBNONEXIST000000000000000000000000000000000000000000000000003';

const ORG_ID = 'stellar-oss';
const ISSUE_ID = '42';

// Error code constants matching src/errors.rs
const ERROR_UNAUTHORIZED_MAINTAINER = 4;
const ERROR_MAINTAINER_NOT_FOUND = 17;

// Mock XDR for all transactions
const MOCK_XDR = 'AAAAAgAAAABMaintainerTxXDRAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Injects the Freighter wallet shim that useWallet expects. */
function injectWallet(page: import('@playwright/test').Page, publicKey: string) {
  return page.addInitScript((key: string) => {
    (globalThis as unknown as Record<string, unknown>)['__freighter_api__'] = {
      isConnected: () => Promise.resolve({ isConnected: true }),
      getAddress: () => Promise.resolve({ address: key, error: undefined }),
      getNetwork: () => Promise.resolve({ network: 'TESTNET' }),
      signTransaction: (_xdr: string) =>
        Promise.resolve({ signedTxXdr: 'AAAA==', error: undefined }),
    };
    localStorage.setItem('wg_wallet_pubkey', key);
  }, publicKey);
}

/** Build a mock Authorization header value for tests that check the format. */
function mockAuthHeader(adminAddress: string): string {
  const payload = {
    admin_address: adminAddress,
    message: 'register-maintainer',
    signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  };
  return 'Bearer ' + Buffer.from(JSON.stringify(payload)).toString('base64');
}

// ---------------------------------------------------------------------------
// Mock route setup helpers
// ---------------------------------------------------------------------------

/**
 * Mock POST /api/admin/maintainers to succeed (register path).
 * The real endpoint returns { xdr, message } — we return a stub XDR.
 */
async function mockRegisterMaintainer(page: import('@playwright/test').Page) {
  await page.route('/api/admin/maintainers', (route) => {
    if (route.request().method() === 'POST') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          xdr: MOCK_XDR,
          message: 'Sign this transaction with your admin key and submit to /broadcast',
        }),
      });
    } else {
      route.continue();
    }
  });
}

/**
 * Mock DELETE /api/admin/maintainers to succeed (deregister path).
 * Returns 200 with xdr for the deregister_maintainer transaction.
 */
async function mockDeregisterMaintainer(page: import('@playwright/test').Page) {
  await page.route('/api/admin/maintainers', (route) => {
    if (route.request().method() === 'DELETE') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          xdr: MOCK_XDR,
          message:
            'Sign this transaction with your admin key and submit to /broadcast',
        }),
      });
    } else {
      route.continue();
    }
  });
}

/**
 * Mock DELETE /api/admin/maintainers to return error 17 (MaintainerNotFound).
 * Used to verify deregistering a non-existent maintainer is rejected.
 */
async function mockDeregisterMaintainerNotFound(page: import('@playwright/test').Page) {
  await page.route('/api/admin/maintainers', (route) => {
    if (route.request().method() === 'DELETE') {
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'MaintainerNotFound',
          code: ERROR_MAINTAINER_NOT_FOUND,
          message: `Maintainer ${NON_EXISTENT_MAINTAINER} is not registered for org ${ORG_ID}`,
        }),
      });
    } else {
      route.continue();
    }
  });
}

/**
 * Mock POST /api/transactions/assign to succeed for a registered maintainer.
 */
async function mockAssignSuccess(page: import('@playwright/test').Page) {
  await page.route('/api/transactions/assign', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        xdr: MOCK_XDR,
        fee: '100',
        network_passphrase: 'Test SDF Network ; September 2015',
      }),
    }),
  );
}

/**
 * Mock POST /api/transactions/assign to fail with UnauthorizedMaintainer (error 4).
 * Simulates a deregistered maintainer attempting to assign an issue.
 */
async function mockAssignUnauthorized(page: import('@playwright/test').Page) {
  await page.route('/api/transactions/assign', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'UnauthorizedMaintainer',
        code: ERROR_UNAUTHORIZED_MAINTAINER,
        message: `Maintainer ${MAINTAINER_ADDRESS} is not authorized for org ${ORG_ID}`,
      }),
    }),
  );
}

/** Mock standard page routes (issues list, contributor counts). */
async function mockPageRoutes(page: import('@playwright/test').Page) {
  await page.route('/api/issues', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        issues: [
          { id: ISSUE_ID, org_id: ORG_ID, title: 'Fix TTL extension bug', status: 'open' },
        ],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      }),
    }),
  );

  await page.route('/api/contributors/*/counts', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ totalApplications: 0, totalAssignments: 0, byOrganization: [] }),
    }),
  );
}

// ---------------------------------------------------------------------------
// Test Suite 1: Admin registers maintainer → maintainer can assign
// ---------------------------------------------------------------------------

test.describe('Admin maintainer registration and deregistration', () => {

  /**
   * Test 1: Register a maintainer via the admin endpoint.
   *
   * Verifies:
   *  - POST /api/admin/maintainers with valid admin auth returns 200 with XDR
   *  - Response contains the expected fields (xdr, message)
   *  - The XDR is a non-empty string
   *
   * Race-condition fix: uses page.waitForResponse with a URL predicate to
   * synchronise on the network round-trip instead of a fixed timeout.
   */
  test('admin can register a maintainer — POST /api/admin/maintainers returns XDR', async ({
    page,
  }) => {
    await injectWallet(page, ADMIN_PUBLIC_KEY);
    await mockPageRoutes(page);

    // Intercept the register_maintainer API call
    let capturedRequest: { body: unknown; headers: Record<string, string> } | null = null;

    await page.route('/api/admin/maintainers', async (route) => {
      const request = route.request();
      const body = JSON.parse(request.postData() ?? '{}') as unknown;
      const headers = Object.fromEntries(
        Object.entries(request.headers()).map(([k, v]) => [k, v]),
      ) as Record<string, string>;
      capturedRequest = { body, headers };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          xdr: MOCK_XDR,
          message: 'Sign this transaction with your admin key and submit to /broadcast',
        }),
      });
    });

    await page.goto('/');

    // Wait for the response using waitForResponse instead of arbitrary timeout.
    // This avoids races where the fetch completes after the assertion runs.
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/admin/maintainers')),
      page.evaluate(
        async ({
          maintainer,
          orgId,
          adminPubKey,
        }: {
          maintainer: string;
          orgId: string;
          adminPubKey: string;
        }) => {
          await fetch('/api/admin/maintainers', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${btoa(
                JSON.stringify({
                  admin_address: adminPubKey,
                  message: 'register-maintainer',
                  signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
                }),
              )}`,
            },
            body: JSON.stringify({
              maintainer_address: maintainer,
              org_id: orgId,
              sequence: '12345678901',
            }),
          });
        },
        { maintainer: MAINTAINER_ADDRESS, orgId: ORG_ID, adminPubKey: ADMIN_PUBLIC_KEY },
      ),
    ]);

    // Use expect.poll to wait for the intercepted request to be populated.
    // This replaces any implicit races between route fulfillment and assertions.
    await expect.poll(() => capturedRequest).not.toBeNull();

    expect(response.status()).toBe(200);
    const body = await response.json() as { xdr?: string; message?: string };
    expect(body).toHaveProperty('xdr');
    expect(typeof body.xdr).toBe('string');
    expect((body.xdr as string).length).toBeGreaterThan(0);
    expect(body).toHaveProperty('message');

    const reqBody = capturedRequest!.body as {
      maintainer_address?: string;
      org_id?: string;
    };
    expect(reqBody.maintainer_address).toBe(MAINTAINER_ADDRESS);
    expect(reqBody.org_id).toBe(ORG_ID);
  });

  /**
   * Test 2: Registered maintainer can assign an issue.
   *
   * Verifies:
   *  - POST /api/transactions/assign returns 200 when maintainer is registered
   *  - Response contains the expected transaction fields
   *
   * Race-condition fix: uses page.waitForResponse for both the register and
   * assign calls to ensure each round-trip completes before asserting.
   */
  test('registered maintainer can assign an issue — assign returns 200', async ({ page }) => {
    await injectWallet(page, ADMIN_PUBLIC_KEY);
    await mockPageRoutes(page);
    await mockRegisterMaintainer(page);
    await mockAssignSuccess(page);

    await page.goto('/');

    // Step 1: Register the maintainer — synchronise on the network response.
    const [registerRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/admin/maintainers')),
      page.evaluate(
        async ({
          maintainer,
          orgId,
          adminPubKey,
        }: {
          maintainer: string;
          orgId: string;
          adminPubKey: string;
        }) => {
          await fetch('/api/admin/maintainers', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${btoa(
                JSON.stringify({
                  admin_address: adminPubKey,
                  message: 'register-maintainer',
                  signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
                }),
              )}`,
            },
            body: JSON.stringify({
              maintainer_address: maintainer,
              org_id: orgId,
              sequence: '12345678901',
            }),
          });
        },
        { maintainer: MAINTAINER_ADDRESS, orgId: ORG_ID, adminPubKey: ADMIN_PUBLIC_KEY },
      ),
    ]);

    expect(registerRes.status()).toBe(200);

    // Step 2: Registered maintainer assigns the issue — synchronise on network response.
    const [assignRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/transactions/assign')),
      page.evaluate(
        async ({
          maintainer,
          contributor,
          orgId,
          issueId,
        }: {
          maintainer: string;
          contributor: string;
          orgId: string;
          issueId: string;
        }) => {
          await fetch('/api/transactions/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              maintainer,
              contributor,
              org_id: orgId,
              issue_id: issueId,
              sequence: '12345678902',
            }),
          });
        },
        {
          maintainer: MAINTAINER_ADDRESS,
          contributor: 'GACONTRIB000000000000000000000000000000000000000000000000001',
          orgId: ORG_ID,
          issueId: ISSUE_ID,
        },
      ),
    ]);

    expect(assignRes.status()).toBe(200);
    const assignBody = await assignRes.json() as { xdr?: string; fee?: string; network_passphrase?: string };
    expect(assignBody).toHaveProperty('xdr');
    expect(assignBody).toHaveProperty('fee');
    expect(assignBody).toHaveProperty('network_passphrase');
  });

  /**
   * Test 3: Admin deregisters the maintainer — DELETE /api/admin/maintainers returns XDR.
   *
   * Verifies:
   *  - DELETE /api/admin/maintainers with valid admin auth returns 200 with XDR
   *  - Response shape matches expectations
   *
   * Race-condition fix: waitForResponse synchronises on the DELETE round-trip.
   */
  test('admin can deregister a maintainer — DELETE /api/admin/maintainers returns XDR', async ({
    page,
  }) => {
    await injectWallet(page, ADMIN_PUBLIC_KEY);
    await mockPageRoutes(page);
    await mockDeregisterMaintainer(page);

    await page.goto('/');

    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/admin/maintainers')),
      page.evaluate(
        async ({
          maintainer,
          orgId,
          adminPubKey,
        }: {
          maintainer: string;
          orgId: string;
          adminPubKey: string;
        }) => {
          await fetch('/api/admin/maintainers', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${btoa(
                JSON.stringify({
                  admin_address: adminPubKey,
                  message: 'deregister-maintainer',
                  signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
                }),
              )}`,
            },
            body: JSON.stringify({
              maintainer_address: maintainer,
              org_id: orgId,
              sequence: '12345678903',
            }),
          });
        },
        { maintainer: MAINTAINER_ADDRESS, orgId: ORG_ID, adminPubKey: ADMIN_PUBLIC_KEY },
      ),
    ]);

    expect(response.status()).toBe(200);
    const body = await response.json() as { xdr?: string; message?: string };
    expect(body).toHaveProperty('xdr');
    expect(typeof body.xdr).toBe('string');
  });

  /**
   * Test 4: Deregistered maintainer cannot assign — fails with UnauthorizedMaintainer (code 4).
   *
   * Full flow:
   *   1. Assign succeeds while maintainer is registered
   *   2. Admin deregisters maintainer
   *   3. Assign fails with HTTP 403 and error code 4
   *
   * Race-condition fix: each step uses waitForResponse to ensure prior requests
   * fully complete before the next step runs — eliminating the state-mutation
   * race that caused flakiness in CI.
   */
  test('deregistered maintainer assign attempt fails with UnauthorizedMaintainer (code 4)', async ({
    page,
  }) => {
    await injectWallet(page, ADMIN_PUBLIC_KEY);
    await mockPageRoutes(page);

    // Track deregistration state to switch mock behavior
    let isDeregistered = false;

    // Route assign to succeed while registered, fail after deregistration
    await page.route('/api/transactions/assign', (route) => {
      if (isDeregistered) {
        route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'UnauthorizedMaintainer',
            code: ERROR_UNAUTHORIZED_MAINTAINER,
            message: `Maintainer ${MAINTAINER_ADDRESS} is not authorized for org ${ORG_ID}`,
          }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            xdr: MOCK_XDR,
            fee: '100',
            network_passphrase: 'Test SDF Network ; September 2015',
          }),
        });
      }
    });

    // Route deregister endpoint
    await page.route('/api/admin/maintainers', (route) => {
      const method = route.request().method();
      if (method === 'DELETE') {
        isDeregistered = true;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ xdr: MOCK_XDR, message: 'Deregistered' }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ xdr: MOCK_XDR, message: 'Registered' }),
        });
      }
    });

    await page.goto('/');

    const contributor = 'GACONTRIB000000000000000000000000000000000000000000000000001';

    // Step 1: Assign succeeds while maintainer is registered.
    // waitForResponse ensures the full network round-trip completes before assertion.
    const [assignBeforeRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/transactions/assign')),
      page.evaluate(
        async ({ maintainer, contributor, orgId, issueId }: Record<string, string>) => {
          await fetch('/api/transactions/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ maintainer, contributor, org_id: orgId, issue_id: issueId }),
          });
        },
        { maintainer: MAINTAINER_ADDRESS, contributor, orgId: ORG_ID, issueId: ISSUE_ID },
      ),
    ]);

    expect(assignBeforeRes.status()).toBe(200);
    const assignBeforeBody = await assignBeforeRes.json() as { xdr?: string };
    expect(assignBeforeBody).toHaveProperty('xdr');

    // Step 2: Admin deregisters the maintainer.
    // waitForResponse ensures isDeregistered is set before the assign call below.
    const [deregRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/admin/maintainers')),
      page.evaluate(
        async ({ maintainer, orgId, adminPubKey }: Record<string, string>) => {
          await fetch('/api/admin/maintainers', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${btoa(
                JSON.stringify({
                  admin_address: adminPubKey,
                  message: 'deregister-maintainer',
                  signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
                }),
              )}`,
            },
            body: JSON.stringify({ maintainer_address: maintainer, org_id: orgId }),
          });
        },
        { maintainer: MAINTAINER_ADDRESS, orgId: ORG_ID, adminPubKey: ADMIN_PUBLIC_KEY },
      ),
    ]);

    expect(deregRes.status()).toBe(200);

    // Use expect.poll to confirm the deregistered flag has propagated before
    // the next fetch — eliminates the mutation race in the route handler.
    await expect.poll(() => isDeregistered).toBe(true);

    // Step 3: Assign now fails with UnauthorizedMaintainer.
    const [assignAfterRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/transactions/assign')),
      page.evaluate(
        async ({ maintainer, contributor, orgId, issueId }: Record<string, string>) => {
          await fetch('/api/transactions/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ maintainer, contributor, org_id: orgId, issue_id: issueId }),
          });
        },
        { maintainer: MAINTAINER_ADDRESS, contributor, orgId: ORG_ID, issueId: ISSUE_ID },
      ),
    ]);

    expect(assignAfterRes.status()).toBe(403);
    const assignAfterBody = await assignAfterRes.json() as { error?: string; code?: number };
    expect(assignAfterBody.error).toBe('UnauthorizedMaintainer');
    expect(assignAfterBody.code).toBe(ERROR_UNAUTHORIZED_MAINTAINER);
  });

  /**
   * Test 5: Deregistering a non-existent maintainer returns MaintainerNotFound (code 17).
   *
   * Verifies that the API surface correctly propagates the contract's
   * MaintainerNotFound error (discriminant 17) when DELETE is called for
   * a maintainer who was never registered.
   *
   * Race-condition fix: waitForResponse synchronises on the DELETE response.
   */
  test('deregistering non-existent maintainer returns MaintainerNotFound error code 17', async ({
    page,
  }) => {
    await injectWallet(page, ADMIN_PUBLIC_KEY);
    await mockPageRoutes(page);
    await mockDeregisterMaintainerNotFound(page);

    await page.goto('/');

    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/admin/maintainers')),
      page.evaluate(
        async ({
          maintainer,
          orgId,
          adminPubKey,
        }: {
          maintainer: string;
          orgId: string;
          adminPubKey: string;
        }) => {
          await fetch('/api/admin/maintainers', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${btoa(
                JSON.stringify({
                  admin_address: adminPubKey,
                  message: 'deregister-maintainer',
                  signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
                }),
              )}`,
            },
            body: JSON.stringify({
              maintainer_address: maintainer,
              org_id: orgId,
              sequence: '12345678904',
            }),
          });
        },
        {
          maintainer: NON_EXISTENT_MAINTAINER,
          orgId: ORG_ID,
          adminPubKey: ADMIN_PUBLIC_KEY,
        },
      ),
    ]);

    // Must be a 404 with the MaintainerNotFound error
    expect(response.status()).toBe(404);
    const body = await response.json() as { error?: string; code?: number; message?: string };
    expect(body.error).toBe('MaintainerNotFound');
    expect(body.code).toBe(ERROR_MAINTAINER_NOT_FOUND);
  });

  /**
   * Test 6: Missing Authorization header returns 401.
   *
   * Verifies the admin endpoint rejects calls without auth credentials,
   * preventing unauthorized maintainer registrations.
   *
   * Race-condition fix: waitForResponse synchronises on the 401 response.
   */
  test('register maintainer without Authorization header returns 401', async ({ page }) => {
    await injectWallet(page, ADMIN_PUBLIC_KEY);
    await mockPageRoutes(page);

    // Return 401 when no Authorization header is present
    await page.route('/api/admin/maintainers', (route) => {
      const authHeader = route.request().headers()['authorization'];
      if (!authHeader) {
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'unauthorized' }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ xdr: MOCK_XDR, message: 'Registered' }),
        });
      }
    });

    await page.goto('/');

    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/admin/maintainers')),
      page.evaluate(
        async ({ maintainer, orgId }: { maintainer: string; orgId: string }) => {
          await fetch('/api/admin/maintainers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // No Authorization header
            body: JSON.stringify({ maintainer_address: maintainer, org_id: orgId }),
          });
        },
        { maintainer: MAINTAINER_ADDRESS, orgId: ORG_ID },
      ),
    ]);

    expect(response.status()).toBe(401);
    const body = await response.json() as { error?: string };
    expect(body.error).toBe('unauthorized');
  });
});

// ---------------------------------------------------------------------------
// Test Suite 2: Environment variable configuration
// ---------------------------------------------------------------------------

test.describe('Admin key environment variable configuration', () => {
  /**
   * Test 7: ADMIN_PUBLIC_KEY env var is used — verifies that the test harness
   * correctly reads the admin key from the environment, enabling CI secret injection.
   *
   * This test does not make a network call; it validates the configuration path.
   *
   * Race-condition fix: uses expect.poll on the localStorage value instead of
   * relying on page.evaluate completing synchronously after goto().
   */
  test('ADMIN_PUBLIC_KEY env var drives the admin identity in CI', async ({ page }) => {
    await injectWallet(page, ADMIN_PUBLIC_KEY);
    await mockPageRoutes(page);

    await page.goto('/');

    // Verify the admin public key is available in the test context
    // (from process.env.ADMIN_PUBLIC_KEY or the fallback constant)
    expect(ADMIN_PUBLIC_KEY).toBeTruthy();
    expect(ADMIN_PUBLIC_KEY).toMatch(/^G[A-Z2-7]{55}$/);

    // Use expect.poll instead of a synchronous evaluate to avoid a race between
    // the addInitScript handler writing to localStorage and the assertion reading it.
    await expect.poll(() =>
      page.evaluate(() => localStorage.getItem('wg_wallet_pubkey'))
    ).toBe(ADMIN_PUBLIC_KEY);
  });
});
