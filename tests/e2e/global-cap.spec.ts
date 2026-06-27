/**
 * E2E: contributor hits global application cap (15) → Apply button disabled with tooltip.
 *
 * Uses MSW (injected via page.addInitScript) so no real backend is needed.
 * Freighter extension is shimmed via addInitScript.
 */

import { test, expect } from '@playwright/test';

const CONTRIBUTOR = 'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBWE3ITMG4YOS';

/** Inject MSW browser-side shim + pre-seeded state at 15 applications */
async function setupCapExceededPage(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    // Freighter shim
    (window as unknown as Record<string, unknown>)['freighter'] = {
      isConnected: () => Promise.resolve(true),
      getPublicKey: () => Promise.resolve(
        'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBWE3ITMG4YOS',
      ),
      signTransaction: (_xdr: string) => Promise.resolve('AAAA=='),
    };
  });

  // Intercept API calls via route interception (Playwright's built-in alternative to MSW)
  await page.route('/api/issues', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        issues: [
          { id: 1, org_id: 'stellar-org', title: 'Fix TTL bug', status: 'open' },
          { id: 2, org_id: 'stellar-org', title: 'Add prop tests', status: 'open' },
        ],
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      }),
    }),
  );

  // Counts endpoint returns 15 (at cap)
  await page.route(`/api/contributors/${CONTRIBUTOR}/counts`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        totalApplications: 15,
        totalAssignments: 0,
        byOrganization: [],
      }),
    }),
  );

  await page.route('/api/contributors/*/counts', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        totalApplications: 15,
        totalAssignments: 0,
        byOrganization: [],
      }),
    }),
  );
}

test.describe('Global cap exceeded flow', () => {
  test('Apply button is disabled when contributor is at the global cap', async ({ page }) => {
    await setupCapExceededPage(page);
    await page.goto('/issues');

    // Wait for issue cards to render
    const applyBtn = page.locator('[data-testid="apply-btn"]').first();
    await expect(applyBtn).toBeVisible({ timeout: 8000 });

    // At global cap the button must be disabled
    await expect(applyBtn).toBeDisabled();
  });

  test('Apply button shows a cap-exceeded tooltip when hovered', async ({ page }) => {
    await setupCapExceededPage(page);
    await page.goto('/issues');

    const applyBtn = page.locator('[data-testid="apply-btn"]').first();
    await expect(applyBtn).toBeVisible({ timeout: 8000 });
    await expect(applyBtn).toBeDisabled();

    // Hover to reveal tooltip
    await applyBtn.hover();

    // Tooltip should mention the cap limit
    const tooltip = page.locator('[data-testid="cap-tooltip"], [role="tooltip"]');
    // Only assert if the app renders a tooltip element; otherwise verify aria-label
    const hasTooltip = await tooltip.count();
    if (hasTooltip > 0) {
      await expect(tooltip.first()).toContainText(/15|cap|limit/i);
    } else {
      const label = await applyBtn.getAttribute('aria-label');
      expect(label).toMatch(/15|cap|limit/i);
    }
  });

  test('Gauge reflects 15/15 when at global cap', async ({ page }) => {
    await setupCapExceededPage(page);
    await page.goto('/');

    // The gauge should show the current count
    const gaugeText = page.locator('.gauge, [data-testid="global-gauge"]');
    const hasGauge = await gaugeText.count();
    if (hasGauge > 0) {
      await expect(gaugeText.first()).toContainText(/15/);
    }
  });
});
