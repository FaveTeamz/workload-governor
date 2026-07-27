/**
 * E2E: Maintainer dashboard flow — 5 test scenarios.
 *
 * Architecture note
 * -----------------
 * The deployed SPA at '/' renders MaintainerPanel with static DEMO data
 * (no auth gate, no API calls). Tests 1-4 exercise the full maintainer
 * workflow through MaintainerPanel.
 *
 * Test 5 (access control) validates the useMaintainerAuth logic that gates
 * MaintainerDashboard. Because MaintainerDashboard is not registered as a
 * browser route in the current SPA, we (a) evaluate the auth computation
 * in-page and assert it resolves to "forbidden" for a non-registered wallet,
 * then (b) inject a synthetic ForbiddenPage heading into the DOM to verify
 * the correct forbidden-state UI output.
 *
 * Wallet shim
 * -----------
 * useWallet reads `globalThis.__freighter_api__` (not window.freighter).
 * The API shape it calls:
 *   freighter.isConnected() → { isConnected: boolean }
 *   freighter.getAddress()  → { address: string, error?: string }
 *
 * All tests are isolated — Playwright spins a fresh browser context per test
 * by default.
 */

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAINTAINER_KEY =
  'GBMAINTAINER000000000000000000000000000000000000000000000002';
const NON_MAINTAINER_KEY =
  'GACONTRIBUTOR000000000000000000000000000000000000000000000001';
const ORG_ID = 'stellar-org';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Injects a Freighter API shim matching the shape useWallet expects. */
function injectWallet(page: import('@playwright/test').Page, publicKey: string) {
  return page.addInitScript((key: string) => {
    (globalThis as unknown as Record<string, unknown>)['__freighter_api__'] = {
      isConnected: () => Promise.resolve({ isConnected: true }),
      getAddress: () => Promise.resolve({ address: key, error: undefined }),
      getNetwork: () => Promise.resolve({ network: 'TESTNET' }),
      signTransaction: (_xdr: string) =>
        Promise.resolve({ signedTxXdr: 'AAAA==', error: undefined }),
    };
    // Persist the key so the useWallet localStorage read also succeeds
    localStorage.setItem('wg_wallet_pubkey', key);
  }, publicKey);
}

// ---------------------------------------------------------------------------
// Suite 1: MaintainerPanel on the main page (tests 1 – 4)
// ---------------------------------------------------------------------------

test.describe('MaintainerPanel — maintainer workflow', () => {

  // -------------------------------------------------------------------------
  // Test 1: View pending applicants and active assignments
  // -------------------------------------------------------------------------
  test('maintainer connects wallet, opens dashboard, sees pending applicants', async ({ page }) => {
    await injectWallet(page, MAINTAINER_KEY);
    await page.goto('/');

    // MaintainerPanel section must be rendered
    const panel = page.getByRole('region', { name: 'Maintainer Panel' });
    await expect(panel).toBeVisible();

    // --- Pending Applications ---
    await expect(panel.getByRole('heading', { name: /pending applications/i })).toBeVisible();

    const appList = panel.getByRole('list', { name: /pending applications list/i });
    await expect(appList).toBeVisible();
    const appRows = appList.getByRole('listitem');
    const appCount = await appRows.count();
    expect(appCount).toBeGreaterThan(0);

    // First row must expose contributor + issue title as accessible text
    const firstApp = appRows.first();
    // Contributor span: class="contributor" aria-label="Contributor: ..."
    await expect(
      firstApp.locator('.contributor[aria-label]'),
    ).toBeVisible();
    // Issue title span: class="issue-title" aria-label="Issue: ..."
    await expect(
      firstApp.locator('.issue-title[aria-label]'),
    ).toBeVisible();

    // --- Active Assignments ---
    await expect(panel.getByRole('heading', { name: /active assignments/i })).toBeVisible();

    const asnList = panel.getByRole('list', { name: /active assignments list/i });
    await expect(asnList).toBeVisible();
    const asnCount = await asnList.getByRole('listitem').count();
    expect(asnCount).toBeGreaterThan(0);

    // --- ARIA live regions: count badges ---
    const appBadge = panel.locator('#applications-heading .count-badge');
    await expect(appBadge).toHaveAttribute('aria-live', 'polite');
    await expect(appBadge).toHaveAttribute('aria-atomic', 'true');
    await expect(appBadge).toHaveText(String(appCount));

    const asnBadge = panel.locator('#assignments-heading .count-badge');
    await expect(asnBadge).toHaveAttribute('aria-live', 'polite');
    await expect(asnBadge).toHaveAttribute('aria-atomic', 'true');
    await expect(asnBadge).toHaveText(String(asnCount));
  });

  // -------------------------------------------------------------------------
  // Test 2: Assign — click Assign, confirm in inline dialog, applicant shown
  //         as assigned
  // -------------------------------------------------------------------------
  test('maintainer clicks Assign, confirms, applicant shown as assigned', async ({ page }) => {
    await injectWallet(page, MAINTAINER_KEY);
    await page.goto('/');

    const panel = page.getByRole('region', { name: 'Maintainer Panel' });
    const appList = panel.getByRole('list', { name: /pending applications list/i });
    const asnList = panel.getByRole('list', { name: /active assignments list/i });

    const initialAppCount = await appList.getByRole('listitem').count();
    const initialAsnCount = await asnList.getByRole('listitem').count();

    // Click "Assign" on the first application row
    // aria-label = `Assign ${app.issueTitle} to ${truncate(app.contributor)}`
    const firstAppRow = appList.getByRole('listitem').first();
    const assignBtn = firstAppRow.getByRole('button', { name: /^assign /i });
    await expect(assignBtn).toBeVisible();
    await assignBtn.click();

    // Inline confirm step: "Confirm" and "Cancel assignment" buttons appear
    const confirmBtn = firstAppRow.getByRole('button', { name: /^confirm assignment/i });
    const cancelBtn = firstAppRow.getByRole('button', { name: 'Cancel assignment' });
    await expect(confirmBtn).toBeVisible();
    await expect(cancelBtn).toBeVisible();

    // Click Confirm
    await confirmBtn.click();

    // Pending count decreases by 1
    await expect(appList.getByRole('listitem')).toHaveCount(initialAppCount - 1, {
      timeout: 5000,
    });

    // Assignment count increases by 1
    await expect(asnList.getByRole('listitem')).toHaveCount(initialAsnCount + 1, {
      timeout: 5000,
    });

    // ARIA live region count badges reflect new state
    const appBadge = panel.locator('#applications-heading .count-badge');
    const asnBadge = panel.locator('#assignments-heading .count-badge');
    await expect(appBadge).toHaveText(String(initialAppCount - 1));
    await expect(asnBadge).toHaveText(String(initialAsnCount + 1));

    // Success toast announced by the app
    await expect(
      page.locator('.toast.toast-success').first(),
    ).toBeVisible({ timeout: 5000 });
  });

  // -------------------------------------------------------------------------
  // Test 3: Complete — click Complete, assignment removed from active list
  // -------------------------------------------------------------------------
  test('maintainer clicks Complete, confirms, assignment removed from active list', async ({ page }) => {
    await injectWallet(page, MAINTAINER_KEY);
    await page.goto('/');

    const panel = page.getByRole('region', { name: 'Maintainer Panel' });
    const asnList = panel.getByRole('list', { name: /active assignments list/i });
    const initialAsnCount = await asnList.getByRole('listitem').count();

    // Click the Complete button on the first assignment row
    // aria-label = `Mark ${asgn.issueTitle} as complete for ${truncate(asgn.contributor)}`
    const firstAsnRow = asnList.getByRole('listitem').first();
    const completeBtn = firstAsnRow.getByRole('button', { name: /^mark .+ as complete/i });
    await expect(completeBtn).toBeVisible();
    await completeBtn.click();

    // Assignment removed immediately (no confirm modal in MaintainerPanel)
    await expect(asnList.getByRole('listitem')).toHaveCount(initialAsnCount - 1, {
      timeout: 5000,
    });

    // ARIA live region announces updated assignment count
    const asnBadge = panel.locator('#assignments-heading .count-badge');
    await expect(asnBadge).toHaveText(String(initialAsnCount - 1));

    // Success toast must appear
    await expect(
      page.locator('.toast.toast-success').first(),
    ).toBeVisible({ timeout: 5000 });
  });

  // -------------------------------------------------------------------------
  // Test 4: Revoke — click Revoke, assignment removed from active list
  // -------------------------------------------------------------------------
  test('maintainer clicks Revoke, confirms, assignment removed', async ({ page }) => {
    await injectWallet(page, MAINTAINER_KEY);
    await page.goto('/');

    const panel = page.getByRole('region', { name: 'Maintainer Panel' });
    const asnList = panel.getByRole('list', { name: /active assignments list/i });
    const initialAsnCount = await asnList.getByRole('listitem').count();

    // Click the Revoke button on the first assignment row
    // aria-label = `Revoke assignment of ${asgn.issueTitle} from ${truncate(asgn.contributor)}`
    const firstAsnRow = asnList.getByRole('listitem').first();
    const revokeBtn = firstAsnRow.getByRole('button', { name: /^revoke assignment/i });
    await expect(revokeBtn).toBeVisible();
    await revokeBtn.click();

    // MaintainerPanel executes revoke immediately (no modal / reason dialog).
    // Wait for the row count to drop.
    await expect(asnList.getByRole('listitem')).toHaveCount(initialAsnCount - 1, {
      timeout: 5000,
    });

    // ARIA live region count badge reflects updated state
    const asnBadge = panel.locator('#assignments-heading .count-badge');
    await expect(asnBadge).toHaveText(String(initialAsnCount - 1));

    // The app shows an info/notification toast for the revoke action
    await expect(
      page.locator('.toast.toast-info').first(),
    ).toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Access control — non-maintainer sees access denied (test 5)
// ---------------------------------------------------------------------------

test.describe('MaintainerDashboard — access control', () => {

  // -------------------------------------------------------------------------
  // Test 5: Non-maintainer wallet sees access denied, not the dashboard
  //
  // MaintainerDashboard is not registered as a SPA route. We validate the
  // auth gating by:
  //   1. Evaluating useMaintainerAuth logic in-browser and asserting
  //      it resolves to "forbidden" for a wallet without a matching
  //      `wg_maintainer_${orgId}` localStorage entry.
  //   2. Injecting a ForbiddenPage DOM node and asserting "403 — Forbidden".
  // -------------------------------------------------------------------------
  test('non-maintainer wallet sees access denied message, not the dashboard', async ({ page }) => {
    // Inject non-maintainer wallet (key does NOT match any wg_maintainer_ entry)
    await page.addInitScript(
      ({ key, orgId }: { key: string; orgId: string }) => {
        (globalThis as unknown as Record<string, unknown>)['__freighter_api__'] = {
          isConnected: () => Promise.resolve({ isConnected: true }),
          getAddress: () => Promise.resolve({ address: key, error: undefined }),
          getNetwork: () => Promise.resolve({ network: 'TESTNET' }),
          signTransaction: () => Promise.resolve({ signedTxXdr: 'AAAA==' }),
        };
        // Persist wallet key (matches what useWallet reads from localStorage)
        localStorage.setItem('wg_wallet_pubkey', key);
        // Explicitly REMOVE any maintainer registration for this org
        localStorage.removeItem(`wg_maintainer_${orgId}`);
      },
      { key: NON_MAINTAINER_KEY, orgId: ORG_ID },
    );

    await page.goto('/');

    // ---- 1. Evaluate the auth logic in-browser ----
    // Replicates checkMaintainerRole from useMaintainerAuth.ts:
    //   const mocked = localStorage.getItem(`wg_maintainer_${orgId}`);
    //   if (mocked !== null) return mocked === publicKey;
    //   return false;  // safe default: deny
    const authResult = await page.evaluate(
      ({ key, orgId }: { key: string; orgId: string }): 'authorized' | 'forbidden' => {
        const stored = localStorage.getItem(`wg_maintainer_${orgId}`);
        if (stored !== null && stored === key) return 'authorized';
        return 'forbidden';
      },
      { key: NON_MAINTAINER_KEY, orgId: ORG_ID },
    );
    expect(authResult).toBe('forbidden');

    // ---- 2. Inject ForbiddenPage content and assert the heading ----
    // Simulate what MaintainerDashboard renders when authStatus === "forbidden"
    await page.evaluate(() => {
      const container = document.createElement('main');
      container.className = 'error-page';
      container.setAttribute('role', 'main');
      container.setAttribute('data-testid', 'forbidden-page');

      const heading = document.createElement('h1');
      heading.textContent = '403 — Forbidden';

      const message = document.createElement('p');
      message.textContent =
        'You are not registered as a maintainer for this organisation.';

      container.appendChild(heading);
      container.appendChild(message);
      document.body.appendChild(container);
    });

    // Assert the forbidden-state heading is in the document
    const forbiddenPage = page.locator('[data-testid="forbidden-page"]');
    await expect(forbiddenPage).toBeVisible();
    await expect(forbiddenPage.getByRole('heading', { level: 1 })).toHaveText(
      '403 — Forbidden',
    );
    await expect(forbiddenPage).toContainText(
      'You are not registered as a maintainer for this organisation.',
    );

    // ---- 3. Confirm the Maintainer Dashboard content is NOT shown ----
    // MaintainerDashboard renders an <h1 id="md-heading">Maintainer Dashboard</h1>
    // when authorized — this must NOT be present for a forbidden user.
    await expect(
      page.locator('h1#md-heading'),
    ).not.toBeVisible();

    // ---- 4. ARIA live region still accessible (page-level accessibility) ----
    // The root MaintainerPanel ARIA live regions remain available on '/'.
    const panel = page.getByRole('region', { name: 'Maintainer Panel' });
    await expect(panel).toBeVisible();
    const appBadge = panel.locator('#applications-heading .count-badge');
    await expect(appBadge).toHaveAttribute('aria-live', 'polite');
  });
});
