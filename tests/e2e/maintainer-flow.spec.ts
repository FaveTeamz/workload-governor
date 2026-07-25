import { test, expect } from '@playwright/test';

const MAINTAINER_KEY = 'GBMAINTAINER000000000000000000000000000000000000000000000002';

interface MockApplication {
  contributor: string;
  orgId: string;
  issueId: string;
}

interface Window {
  freighter: {
    isConnected: () => Promise<boolean>;
    getPublicKey: () => Promise<string>;
    signTransaction: (xdr: string) => Promise<string>;
  };
  __mockApplications: MockApplication[];
}

const MOCK_APPLICATIONS: MockApplication[] = [
  { contributor: 'GACONTRIBUTOR001', orgId: 'org-stellar', issueId: 'issue-42' },
];
const FIXED_XDR = 'AAAAAgAAAAA...FIXEDXDR...AAAAA==';

test('maintainer assign and complete flow', async ({ page }) => {
  await page.addInitScript(() => {
    const window_ = window as unknown as Window;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    window_.freighter = {
      isConnected: () => Promise.resolve(true),
      getPublicKey: () => Promise.resolve(MAINTAINER_KEY),
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      signTransaction: (_xdr: string) => Promise.resolve(FIXED_XDR),
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    window_.__mockApplications = MOCK_APPLICATIONS;
  });

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
