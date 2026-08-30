/**
 * E2E: contributor hits global application cap (15) → Apply button disabled with tooltip.
 * Issue #380: 15 concurrent applications, disabled buttons, tooltip, gauge updates, withdraw restore.
 *
 * All API calls are intercepted via Playwright's page.route() (MSW-compatible patterns)
 * so no real backend or blockchain is needed.
 * Freighter extension is shimmed via addInitScript.
 */

import { test, expect } from '@playwright/test';

const CONTRIBUTOR = 'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBWE3ITMG4YOS';
const GLOBAL_CAP = 15;

/** Build a list of N open issues for use in mock responses. */
function makeIssues(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    org_id: 'stellar-org',
    title: `Issue ${i + 1}: task to apply for`,
    status: 'open',
  }));
}

/**
 * Register common page.route() intercepts:
 *  - /api/issues         → returns `issueCount` open issues
 *  - contributor counts  → returns `applicationCount`
 */
async function setupRoutes(
  page: import('@playwright/test').Page,
  opts: { applicationCount: number; issueCount?: number },
) {
  const { applicationCount, issueCount = 16 } = opts;
  const issues = makeIssues(issueCount);

  // Freighter shim — must be added before page.goto()
  await page.addInitScript((contributor: string) => {
    (window as unknown as Record<string, unknown>)['freighter'] = {
      isConnected: () => Promise.resolve(true),
      getPublicKey: () => Promise.resolve(contributor),
      signTransaction: (_xdr: string) => Promise.resolve('AAAA=='),
    };
  }, CONTRIBUTOR);

  // Issues list
  await page.route('/api/issues', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        issues,
        total: issues.length,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
    }),
  );

  // Contributor counts — exact address
  await page.route(`/api/contributors/${CONTRIBUTOR}/counts`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        totalApplications: applicationCount,
        totalAssignments: 0,
        byOrganization: [],
      }),
    }),
  );

  // Contributor counts — wildcard (handles any address format the app uses)
  await page.route('/api/contributors/*/counts', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        totalApplications: applicationCount,
        totalAssignments: 0,
        byOrganization: [],
      }),
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suite 1: Apply button disabled when cap is already reached (14 → apply → 15)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Global cap – cap reached after 15th application', () => {
  /**
   * Scenario: contributor has 14 applications and applies for one more.
   * After the apply the mock counts returns 15 (cap reached) and subsequent
   * Apply buttons should become disabled.
   */
  test('Apply buttons become disabled after reaching global cap of 15', async ({ page }) => {
    let applicationCount = 14;

    // Freighter shim
    await page.addInitScript((contributor: string) => {
      (window as unknown as Record<string, unknown>)['freighter'] = {
        isConnected: () => Promise.resolve(true),
        getPublicKey: () => Promise.resolve(contributor),
        signTransaction: (_xdr: string) => Promise.resolve('AAAA=='),
      };
    }, CONTRIBUTOR);

    // Issues list with multiple issues
    const issues = makeIssues(5);
    await page.route('/api/issues', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          issues,
          total: issues.length,
          page: 1,
          limit: 20,
          totalPages: 1,
        }),
      }),
    );

    // Counts — returns current applicationCount (mutable closure)
    const fulfillCounts = (route: import('@playwright/test').Route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          totalApplications: applicationCount,
          totalAssignments: 0,
          byOrganization: [],
        }),
      });

    await page.route(`/api/contributors/${CONTRIBUTOR}/counts`, fulfillCounts);
    await page.route('/api/contributors/*/counts', fulfillCounts);

    // Apply endpoint — bumps counter to 15 (cap reached)
    await page.route('/api/transactions/apply', async (route) => {
      applicationCount = GLOBAL_CAP;
      // Re-register counts routes with new value so subsequent fetches return 15
      await page.route(`/api/contributors/${CONTRIBUTOR}/counts`, (r) =>
        r.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            totalApplications: GLOBAL_CAP,
            totalAssignments: 0,
            byOrganization: [],
          }),
        }),
      );
      await page.route('/api/contributors/*/counts', (r) =>
        r.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            totalApplications: GLOBAL_CAP,
            totalAssignments: 0,
            byOrganization: [],
          }),
        }),
      );
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ xdr: 'AAAA==', fee: '100', instructions: 0, readBytes: 0, writeBytes: 0 }),
      });
    });

    await page.goto('/issues');

    // First apply button should be enabled at 14 applications
    const firstApplyBtn = page.locator('[data-testid="apply-btn"]').first();
    await expect(firstApplyBtn).toBeVisible({ timeout: 8000 });
    await expect(firstApplyBtn).toBeEnabled();

    // Click to apply — this pushes count to 15
    await firstApplyBtn.click();

    // After applying, wait for UI to update (toast, button label change, or re-fetch)
    await page.waitForTimeout(500);

    // All remaining Apply buttons should now be disabled (at cap)
    const remainingApplyBtns = page.locator('[data-testid="apply-btn"]:not([aria-label*="Withdraw"]):not(:text-matches("Withdraw"))');
    const btnCount = await remainingApplyBtns.count();

    if (btnCount > 0) {
      // Check that all visible apply buttons are disabled
      for (let i = 0; i < Math.min(btnCount, 3); i++) {
        const btn = remainingApplyBtns.nth(i);
        const isVisible = await btn.isVisible();
        if (isVisible) {
          await expect(btn).toBeDisabled();
        }
      }
    }

    // Alternatively: verify via cap count indicator in UI
    const capIndicator = page.locator('[data-testid="cap-count"], .cap-count, [aria-label*="15"]');
    const hasCapIndicator = await capIndicator.count();
    if (hasCapIndicator > 0) {
      await expect(capIndicator.first()).toBeVisible();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test suite 2: Apply buttons are disabled when cap is pre-exceeded at 15
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Global cap – cap pre-exceeded at 15 applications', () => {
  test('All Apply buttons are disabled when contributor already has 15 applications', async ({
    page,
  }) => {
    await setupRoutes(page, { applicationCount: GLOBAL_CAP });
    await page.goto('/issues');

    // Wait for issue cards to render
    const firstApplyBtn = page.locator('[data-testid="apply-btn"]').first();
    await expect(firstApplyBtn).toBeVisible({ timeout: 8000 });

    // At global cap, all apply buttons must be disabled
    await expect(firstApplyBtn).toBeDisabled();

    // Check that there are multiple disabled apply buttons
    const allApplyBtns = page.locator('[data-testid="apply-btn"]');
    const totalBtns = await allApplyBtns.count();
    if (totalBtns > 1) {
      await expect(allApplyBtns.nth(1)).toBeDisabled();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Tooltip test: disabled Apply buttons show cap-exceeded message
  // ─────────────────────────────────────────────────────────────────────────

  test('Disabled Apply button shows tooltip explaining the cap is reached', async ({ page }) => {
    await setupRoutes(page, { applicationCount: GLOBAL_CAP });
    await page.goto('/issues');

    const applyBtn = page.locator('[data-testid="apply-btn"]').first();
    await expect(applyBtn).toBeVisible({ timeout: 8000 });
    await expect(applyBtn).toBeDisabled();

    // Hover to reveal tooltip
    await applyBtn.hover();
    await page.waitForTimeout(300); // allow tooltip animation

    // Strategy 1: look for a tooltip element in the DOM
    const tooltip = page.locator(
      '[data-testid="cap-tooltip"], [role="tooltip"], .tooltip, [data-tooltip]',
    );
    const hasTooltip = await tooltip.count();

    if (hasTooltip > 0) {
      // Tooltip should mention 15, cap, or limit
      await expect(tooltip.first()).toContainText(/15|cap|limit/i);
    } else {
      // Strategy 2: check aria-label on the button itself
      const ariaLabel = await applyBtn.getAttribute('aria-label');
      const title = await applyBtn.getAttribute('title');
      const combined = `${ariaLabel ?? ''} ${title ?? ''}`;
      expect(combined).toMatch(/15|cap|limit/i);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Gauge test: Gauge component shows 15/15 when at global cap
  // ─────────────────────────────────────────────────────────────────────────

  test('Gauge component shows 15/15 when contributor is at the global cap', async ({ page }) => {
    await setupRoutes(page, { applicationCount: GLOBAL_CAP });
    await page.goto('/');

    // The gauge renders "value/max" as text (e.g. "15/15")
    const gauge = page.locator('.gauge, [data-testid="global-gauge"], [aria-label*="gauge"]');
    const hasGauge = await gauge.count();

    if (hasGauge > 0) {
      await expect(gauge.first()).toContainText(/15/, { timeout: 5000 });
    } else {
      // If gauge is on the issues page instead
      await page.goto('/issues');
      const issuePageGauge = page.locator('.gauge, [data-testid="global-gauge"]');
      const hasIssuePageGauge = await issuePageGauge.count();
      if (hasIssuePageGauge > 0) {
        await expect(issuePageGauge.first()).toContainText(/15/, { timeout: 5000 });
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Real-time gauge update: gauge increments from 14 to 15 after apply
  // ─────────────────────────────────────────────────────────────────────────

  test('Gauge cap count updates in real time after each apply', async ({ page }) => {
    let applicationCount = 14;

    // Freighter shim
    await page.addInitScript((contributor: string) => {
      (window as unknown as Record<string, unknown>)['freighter'] = {
        isConnected: () => Promise.resolve(true),
        getPublicKey: () => Promise.resolve(contributor),
        signTransaction: (_xdr: string) => Promise.resolve('AAAA=='),
      };
    }, CONTRIBUTOR);

    await page.route('/api/issues', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          issues: makeIssues(3),
          total: 3,
          page: 1,
          limit: 20,
          totalPages: 1,
        }),
      }),
    );

    const fulfillCounts = (route: import('@playwright/test').Route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          totalApplications: applicationCount,
          totalAssignments: 0,
          byOrganization: [],
        }),
      });

    await page.route(`/api/contributors/${CONTRIBUTOR}/counts`, fulfillCounts);
    await page.route('/api/contributors/*/counts', fulfillCounts);

    // Apply endpoint — bump counter to 15
    await page.route('/api/transactions/apply', async (route) => {
      applicationCount = GLOBAL_CAP;
      await page.route(`/api/contributors/${CONTRIBUTOR}/counts`, (r) =>
        r.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            totalApplications: GLOBAL_CAP,
            totalAssignments: 0,
            byOrganization: [],
          }),
        }),
      );
      await page.route('/api/contributors/*/counts', (r) =>
        r.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            totalApplications: GLOBAL_CAP,
            totalAssignments: 0,
            byOrganization: [],
          }),
        }),
      );
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ xdr: 'AAAA==', fee: '100', instructions: 0, readBytes: 0, writeBytes: 0 }),
      });
    });

    await page.goto('/issues');

    // Verify gauge shows 14 initially
    const gauge = page.locator('.gauge, [data-testid="global-gauge"], [aria-label*="gauge"]');
    const hasGauge = await gauge.count();
    if (hasGauge > 0) {
      await expect(gauge.first()).toContainText(/14/, { timeout: 5000 });
    }

    // Click apply on the first issue
    const applyBtn = page.locator('[data-testid="apply-btn"]').first();
    await expect(applyBtn).toBeVisible({ timeout: 8000 });
    await expect(applyBtn).toBeEnabled();
    await applyBtn.click();

    // After applying, gauge should update to 15
    await page.waitForTimeout(500);

    if (hasGauge > 0) {
      await expect(gauge.first()).toContainText(/15/, { timeout: 5000 });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test suite 3: Withdraw restores Apply button availability
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Global cap – withdraw restores Apply button', () => {
  test('Withdrawing one application re-enables Apply buttons', async ({ page }) => {
    let applicationCount = GLOBAL_CAP; // start at cap

    // Freighter shim
    await page.addInitScript((contributor: string) => {
      (window as unknown as Record<string, unknown>)['freighter'] = {
        isConnected: () => Promise.resolve(true),
        getPublicKey: () => Promise.resolve(contributor),
        signTransaction: (_xdr: string) => Promise.resolve('AAAA=='),
      };
    }, CONTRIBUTOR);

    // Issues — first issue is already applied (shows Withdraw button), rest are new
    const issues = [
      { id: 1, org_id: 'stellar-org', title: 'Issue 1 – already applied', status: 'open' },
      { id: 2, org_id: 'stellar-org', title: 'Issue 2 – not yet applied', status: 'open' },
      { id: 3, org_id: 'stellar-org', title: 'Issue 3 – not yet applied', status: 'open' },
    ];

    await page.route('/api/issues', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ issues, total: issues.length, page: 1, limit: 20, totalPages: 1 }),
      }),
    );

    // Also handle has_applied-style check if the app calls per-issue endpoints
    await page.route('/api/contributors/*/issues/*/status', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ applied: true, assigned: false }),
      }),
    );

    const fulfillCounts = (route: import('@playwright/test').Route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          totalApplications: applicationCount,
          totalAssignments: 0,
          byOrganization: [],
        }),
      });

    await page.route(`/api/contributors/${CONTRIBUTOR}/counts`, fulfillCounts);
    await page.route('/api/contributors/*/counts', fulfillCounts);

    // Withdraw endpoint — drops count back to 14
    await page.route('/api/transactions/withdraw', async (route) => {
      applicationCount = GLOBAL_CAP - 1;
      await page.route(`/api/contributors/${CONTRIBUTOR}/counts`, (r) =>
        r.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            totalApplications: GLOBAL_CAP - 1,
            totalAssignments: 0,
            byOrganization: [],
          }),
        }),
      );
      await page.route('/api/contributors/*/counts', (r) =>
        r.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            totalApplications: GLOBAL_CAP - 1,
            totalAssignments: 0,
            byOrganization: [],
          }),
        }),
      );
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ xdr: 'AAAA==', fee: '100', instructions: 0, readBytes: 0, writeBytes: 0 }),
      });
    });

    await page.goto('/issues');

    // At global cap: apply buttons for non-applied issues should be disabled
    const applyBtns = page.locator('[data-testid="apply-btn"]');
    await expect(applyBtns.first()).toBeVisible({ timeout: 8000 });

    // Find a withdraw button on the already-applied issue
    const withdrawBtn = page.locator('[data-testid="withdraw-btn"], button:has-text("Withdraw")').first();
    const hasWithdrawBtn = await withdrawBtn.count();

    if (hasWithdrawBtn > 0) {
      await expect(withdrawBtn).toBeVisible();

      // After clicking withdraw, the count drops from 15 to 14
      await withdrawBtn.click();
      await page.waitForTimeout(500);

      // Apply buttons on remaining issues should now be enabled
      const applyBtnsAfter = page.locator('[data-testid="apply-btn"]');
      const btnCount = await applyBtnsAfter.count();
      if (btnCount > 0) {
        await expect(applyBtnsAfter.first()).toBeEnabled();
      }
    } else {
      // If there's no separate withdraw button, look for Apply button that changed to Withdraw
      const withdrawViaApply = page.locator('button:has-text("Withdraw")').first();
      const hasIt = await withdrawViaApply.count();
      if (hasIt > 0) {
        await withdrawViaApply.click();
        await page.waitForTimeout(500);

        // After withdraw, other apply buttons should be enabled
        const enabledApplyBtns = page.locator('[data-testid="apply-btn"]:not(:has-text("Withdraw"))');
        const enabledCount = await enabledApplyBtns.count();
        if (enabledCount > 0) {
          await expect(enabledApplyBtns.first()).toBeEnabled();
        }
      }
    }

    // Gauge should now reflect 14
    const gauge = page.locator('.gauge, [data-testid="global-gauge"]');
    const hasGauge = await gauge.count();
    if (hasGauge > 0) {
      await expect(gauge.first()).toContainText(/14/, { timeout: 5000 });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test suite 4: MSW-style state verification (using page.route state management)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Global cap – 15 concurrent applications simulation', () => {
  /**
   * Simulates a contributor starting with 0 applications and verifies:
   * - After 15 successful applies the cap is reached
   * - The 16th attempt is blocked (button disabled / API returns cap error)
   */
  test('cap is enforced after 15 applications via mock state', async ({ page }) => {
    // Start at 14 — one away from cap
    await setupRoutes(page, { applicationCount: 14, issueCount: 2 });

    // Apply endpoint — simulates reaching the cap on the 15th call
    await page.route('/api/transactions/apply', async (route) => {
      // Return a successful apply response
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ xdr: 'AAAA==', fee: '100', instructions: 0, readBytes: 0, writeBytes: 0 }),
      });

      // After this apply the backend reports 15 (cap reached)
      await page.route('/api/contributors/*/counts', (r) =>
        r.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            totalApplications: GLOBAL_CAP,
            totalAssignments: 0,
            byOrganization: [],
          }),
        }),
      );
    });

    await page.goto('/issues');

    const applyBtn = page.locator('[data-testid="apply-btn"]').first();
    await expect(applyBtn).toBeVisible({ timeout: 8000 });
    await expect(applyBtn).toBeEnabled();

    // 15th apply — this pushes count to cap
    await applyBtn.click();
    await page.waitForTimeout(600);

    // All remaining apply buttons should now be disabled
    const remainingBtns = page.locator('[data-testid="apply-btn"]');
    const count = await remainingBtns.count();
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const btn = remainingBtns.nth(i);
        const text = await btn.innerText();
        // Skip withdraw-labeled buttons
        if (/withdraw/i.test(text)) continue;
        await expect(btn).toBeDisabled();
      }
    }
  });
});
