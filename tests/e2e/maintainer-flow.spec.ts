import { test, expect } from '@playwright/test';

const MAINTAINER_KEY = 'GBMAINTAINER000000000000000000000000000000000000000000000002';
const FIXED_XDR = 'AAAAAgAAAAA...FIXEDXDR...AAAAA==';

const MOCK_APPLICATIONS = [
  { contributor: 'GACONTRIBUTOR001', orgId: 'org-stellar', issueId: 'issue-42' },
];

test('maintainer assign and complete flow', async ({ page }) => {
  await page.addInitScript(({ pubkey, apps, xdr }) => {
    (window as any).freighter = {
      isConnected: () => Promise.resolve(true),
      getPublicKey: () => Promise.resolve(pubkey),
      signTransaction: (_xdr: string) => Promise.resolve(xdr),
    };
    (window as any).__mockApplications = apps;
  }, { pubkey: MAINTAINER_KEY, apps: MOCK_APPLICATIONS, xdr: FIXED_XDR });

  await page.goto('/maintainer');

  // At least one pending application must be visible
  const pendingApp = page.locator('[data-testid="pending-application"]').first();
  await expect(pendingApp).toBeVisible();

  // Assign the first application
  await pendingApp.locator('[data-testid="assign-btn"]').click();

  // Application should now appear in active assignments
  const activeAssignment = page.locator('[data-testid="active-assignment"]').first();
  await expect(activeAssignment).toBeVisible();

  // Complete the assignment
  await activeAssignment.locator('[data-testid="complete-btn"]').click();

  // Active assignments section should be empty
  await expect(page.locator('[data-testid="active-assignment"]')).toHaveCount(0);
});
