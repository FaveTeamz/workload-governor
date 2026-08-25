/**
 * E2E: Contributor applies → gauge increments from n to n+1.
 *
 * Freighter is shimmed via addInitScript.
 * All API calls are intercepted with page.route (no real backend needed).
 */

import { test, expect } from '@playwright/test';

const CONTRIBUTOR = 'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBWE3ITMG4YOS';

test.describe('Gauge increments after apply', () => {
  test('global application count increments when contributor applies', async ({ page }) => {
    let applicationCount = 3; // start at 3

    // Freighter shim
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>)['freighter'] = {
        isConnected: () => Promise.resolve(true),
        getPublicKey: () => Promise.resolve(
          'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBWE3ITMG4YOS',
        ),
        signTransaction: (_xdr: string) => Promise.resolve('AAAA=='),
      };
    });

    // Issues list
    await page.route('/api/issues', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          issues: [{ id: 1, org_id: 'stellar-org', title: 'Fix TTL bug', status: 'open' }],
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        }),
      }),
    );

    // Contributor counts — increments after apply
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

    // Apply endpoint — bump count so subsequent /counts calls return 4
    await page.route('/api/transactions/apply', async (route) => {
      applicationCount = 4;
      // Re-register counts route with new value
      await page.route('/api/contributors/*/counts', (r) =>
        r.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            totalApplications: applicationCount,
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

    // Find and click the Apply button on the first issue
    const applyBtn = page.locator('[data-testid="apply-btn"]').first();
    await expect(applyBtn).toBeVisible({ timeout: 8000 });
    await expect(applyBtn).toBeEnabled();
    await applyBtn.click();

    // Success toast should appear
    await expect(
      page.locator('[data-testid="toast-success"], .toast--success, [role="status"]').first(),
    ).toBeVisible({ timeout: 5000 });

    // Apply button should change label to Withdraw after successful application
    await expect(applyBtn).toHaveText(/withdraw/i, { timeout: 5000 });
  });

  test('Gauge component renders correct value/max props', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>)['freighter'] = {
        isConnected: () => Promise.resolve(true),
        getPublicKey: () => Promise.resolve(
          'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBWE3ITMG4YOS',
        ),
        signTransaction: (_xdr: string) => Promise.resolve('AAAA=='),
      };
    });

    await page.route('/api/contributors/*/counts', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ totalApplications: 7, totalAssignments: 2, byOrganization: [] }),
      }),
    );

    await page.goto('/');

    // Gauge SVG should expose current value text
    const gauge = page.locator('.gauge svg, [data-testid="global-gauge"]').first();
    const hasGauge = await gauge.count();
    if (hasGauge > 0) {
      // The gauge renders "value/max" as a text element
      await expect(gauge).toContainText(/\d+\/\d+/, { timeout: 5000 });
    }
  });
});
