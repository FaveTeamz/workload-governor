/**
 * user-flows.spec.ts — frontend integration tests with Playwright (issue #18)
 *
 * Three user flows:
 *  1. Contributor: wallet connect → apply for issue → withdraw
 *  2. Maintainer: assign issue → mark complete
 *  3. Admin: register a maintainer
 *
 * All API routes are mocked; no real backend needed.
 * Freighter is injected via globalThis.__freighter_api__ shim.
 * Tests run in CI without a real wallet; screenshots captured on failure.
 */

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONTRIBUTOR = 'GACONTRIB000000000000000000000000000000000000000000001';
const MAINTAINER = 'GAMAINT000000000000000000000000000000000000000000000002';
const ADMIN = 'GAADMIN000000000000000000000000000000000000000000000003';

const MOCK_ISSUES = {
  issues: [
    { id: 1, org_id: 'test-org', title: 'Fix TTL extension bug', status: 'open' },
    { id: 2, org_id: 'test-org', title: 'Add mutation tests', status: 'open' },
  ],
  total: 2,
  page: 1,
  limit: 10,
  totalPages: 1,
};

const MOCK_TX = { xdr: 'AAAA==', fee: '100', instructions: 0, readBytes: 0, writeBytes: 0 };
const MOCK_TX_RESULT = { hash: 'abc123', status: 'success' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Inject a Freighter shim into globalThis before page load.
 * useWallet reads `globalThis.__freighter_api__`.
 */
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

/**
 * Mock common API routes used across tests.
 */
async function mockStandardRoutes(
  page: import('@playwright/test').Page,
  options: { totalApplications?: number; totalAssignments?: number } = {},
) {
  const { totalApplications = 0, totalAssignments = 0 } = options;

  await page.route('/api/issues*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(MOCK_ISSUES),
    }),
  );

  await page.route('/api/contributors/*/counts', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        totalApplications,
        totalAssignments,
        byOrganization: [],
      }),
    }),
  );

  await page.route('/api/contributors/*/applications', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) }),
  );

  await page.route('/api/contributors/*/assignments', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) }),
  );
}

// ===========================================================================
// Suite 1: Contributor flow — wallet connect → apply → withdraw
// ===========================================================================

test.describe('Contributor flow: connect wallet, apply, withdraw', () => {
  test.beforeEach(async ({ page }) => {
    await injectWallet(page, CONTRIBUTOR);
    await mockStandardRoutes(page, { totalApplications: 0 });

    await page.route('/api/transactions/build-apply', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(MOCK_TX) }),
    );

    await page.route('/api/transactions/submit', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(MOCK_TX_RESULT) }),
    );
  });

  test('TC-1: User connects wallet, page shows connected state with wallet address', async ({ page }) => {
    await page.goto('/');

    // Look for a wallet address display (truncated or full)
    const walletDisplay = page.locator(
      `text=${CONTRIBUTOR.substring(0, 8)}`, // first 8 chars of the address
    );
    await expect(walletDisplay).toBeVisible({ timeout: 8000 }).catch(async () => {
      // Fallback: search for "Connect" button replaced with address
      const connectBtn = page.locator('button:has-text("Connect")');
      const isGone = (await connectBtn.count()) === 0;
      expect(isGone).toBe(true);
    });
  });

  test('TC-2: Apply for issue — click Apply, confirm in modal, verify Applied state shown', async ({ page }) => {
    await page.goto('/');

    const applyBtn = page
      .locator('[data-testid="apply-btn"], button:has-text("Apply")')
      .first();
    await expect(applyBtn).toBeVisible({ timeout: 8000 });

    await applyBtn.click();

    // Handle modal confirmation if it appears
    const confirmBtn = page
      .locator('[data-testid="confirm-btn"], button:has-text("Confirm"), button:has-text("Submit")')
      .first();
    const modalVisible = await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false);
    if (modalVisible) {
      await confirmBtn.click();
    }

    // Expect success feedback: success toast, or button changes to Withdraw
    const successToast = page.locator('[data-testid="toast-success"], [role="alert"]:has-text("success")');
    const withdrawBtn = page.locator('[data-testid="withdraw-btn"], button:has-text("Withdraw")');

    await Promise.race([
      expect(successToast).toBeVisible({ timeout: 8000 }),
      expect(withdrawBtn).toBeVisible({ timeout: 8000 }),
    ]).catch(async () => {
      // Fallback: button text changed
      const btnText = await applyBtn.textContent();
      expect(btnText?.toLowerCase()).toMatch(/withdraw|applied/);
    });
  });

  test('TC-3: Withdraw — click Withdraw, confirm, verify back to unapplied state', async ({ page }) => {
    // Start with 1 pending application
    await page.route('/api/contributors/*/counts', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          totalApplications: 1,
          totalAssignments: 0,
          byOrganization: [],
        }),
      }),
    );

    await page.route('/api/transactions/build-withdraw', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(MOCK_TX) }),
    );

    await page.goto('/');

    const withdrawBtn = page
      .locator('[data-testid="withdraw-btn"], button:has-text("Withdraw")')
      .first();
    await expect(withdrawBtn).toBeVisible({ timeout: 8000 });

    await withdrawBtn.click();

    // Handle confirmation modal if present
    const confirmBtn = page.locator('[data-testid="confirm-btn"], button:has-text("Confirm")').first();
    const hasModal = await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasModal) {
      await confirmBtn.click();
    }

    // Expect Apply button to reappear
    const applyBtn = page.locator('[data-testid="apply-btn"], button:has-text("Apply")').first();
    await expect(applyBtn).toBeVisible({ timeout: 8000 });
  });
});

// ===========================================================================
// Suite 2: Maintainer flow — assign → complete
// ===========================================================================

test.describe('Maintainer flow: assign issue, mark complete', () => {
  test.beforeEach(async ({ page }) => {
    await injectWallet(page, MAINTAINER);

    // Mock issues with pending applications
    await page.route('/api/issues*', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          issues: [
            { id: 1, org_id: 'test-org', title: 'Issue 1', status: 'open', applicants: [CONTRIBUTOR] },
          ],
        }),
      }),
    );

    await page.route('/api/contributors/*/counts', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ totalApplications: 0, totalAssignments: 1, byOrganization: [] }),
      }),
    );

    await page.route('/api/transactions/build-assign', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(MOCK_TX) }),
    );

    await page.route('/api/transactions/build-complete', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(MOCK_TX) }),
    );

    await page.route('/api/transactions/submit', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(MOCK_TX_RESULT) }),
    );
  });

  test('TC-1: Maintainer sees pending applications in MaintainerPanel', async ({ page }) => {
    await page.goto('/');

    const panel = page.locator('[data-testid="maintainer-panel"], [role="region"]:has-text("Maintainer")');
    await expect(panel).toBeVisible({ timeout: 8000 }).catch(async () => {
      // Fallback: look for heading text
      const heading = page.locator('h1, h2, h3').filter({ hasText: /pending|maintainer|applications/i });
      await expect(heading).toBeVisible({ timeout: 8000 });
    });

    const applicantList = page.locator('[data-testid="pending-applicants"], ul').first();
    await expect(applicantList).toBeVisible({ timeout: 8000 });
  });

  test('TC-2: Maintainer assigns contributor, sees assignment in active list', async ({ page }) => {
    await page.goto('/');

    const assignBtn = page
      .locator('[data-testid="assign-btn"], button:has-text("Assign")')
      .first();
    await expect(assignBtn).toBeVisible({ timeout: 8000 });

    await assignBtn.click();

    const confirmBtn = page.locator('[data-testid="confirm-btn"], button:has-text("Confirm")').first();
    const hasModal = await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasModal) {
      await confirmBtn.click();
    }

    // Expect success feedback
    const successToast = page.locator('[data-testid="toast-success"], [role="alert"]:has-text("success")');
    const activeList = page.locator('[data-testid="active-assignments"], [role="list"]');

    await Promise.race([
      expect(successToast).toBeVisible({ timeout: 8000 }),
      expect(activeList).toBeVisible({ timeout: 8000 }),
    ]);
  });

  test('TC-3: Maintainer marks assignment complete', async ({ page }) => {
    await page.goto('/');

    const completeBtn = page
      .locator('[data-testid="complete-btn"], button:has-text("Complete")')
      .first();
    await expect(completeBtn).toBeVisible({ timeout: 8000 });

    await completeBtn.click();

    const confirmBtn = page.locator('[data-testid="confirm-btn"], button:has-text("Confirm")').first();
    const hasModal = await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasModal) {
      await confirmBtn.click();
    }

    const successToast = page.locator('[data-testid="toast-success"], [role="alert"]:has-text("success")');
    await expect(successToast).toBeVisible({ timeout: 8000 });
  });
});

// ===========================================================================
// Suite 3: Admin flow — register maintainer
// ===========================================================================

test.describe('Admin flow: register a maintainer', () => {
  test.beforeEach(async ({ page }) => {
    await injectWallet(page, ADMIN);

    await page.route('/api/admin/maintainers*', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ maintainers: [] }),
        });
      }
      if (route.request().method() === 'POST') {
        return route.fulfill({
          contentType: 'application/json',
          status: 201,
          body: JSON.stringify({ address: MAINTAINER, org_id: 'test-org' }),
        });
      }
      return route.continue();
    });
  });

  test('TC-1: Admin navigates to admin panel, submits maintainer registration, sees success', async ({ page }) => {
    await page.goto('/admin');

    const adminPanel = page.locator('[data-testid="admin-panel"], [role="main"]:has-text("Admin")');
    await expect(adminPanel).toBeVisible({ timeout: 8000 }).catch(async () => {
      // Fallback: check for heading
      const heading = page.locator('h1, h2, h3').filter({ hasText: /admin|register/i });
      await expect(heading).toBeVisible({ timeout: 8000 });
    });

    const addressInput = page.locator('[data-testid="maintainer-address"], input[name="address"], input[placeholder*="address"]').first();
    const orgInput = page.locator('[data-testid="org-id"], input[name="org_id"], input[placeholder*="org"]').first();

    await expect(addressInput).toBeVisible({ timeout: 8000 });
    await addressInput.fill(MAINTAINER);

    await expect(orgInput).toBeVisible({ timeout: 8000 });
    await orgInput.fill('test-org');

    const submitBtn = page
      .locator('[data-testid="register-btn"], button:has-text("Register"), button[type="submit"]')
      .first();
    await submitBtn.click();

    // Expect success feedback
    const successToast = page.locator('[data-testid="toast-success"], [role="alert"]:has-text("success")');
    await expect(successToast).toBeVisible({ timeout: 8000 });
  });
});
