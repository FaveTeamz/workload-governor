import { test, expect } from '@playwright/test';

const TEST_PUBLIC_KEY = 'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBWE3ITMG4YOS';
const FIXED_XDR = 'AAAAAgAAAAA...FIXEDXDR...AAAAA==';

test('contributor apply flow', async ({ page }) => {
  // Inject Freighter mock before any page script runs
  await page.addInitScript((pubkey) => {
    (window as any).freighter = {
      isConnected: () => Promise.resolve(true),
      getPublicKey: () => Promise.resolve(pubkey),
      signTransaction: (_xdr: string) =>
        Promise.resolve('AAAAAgAAAAA...FIXEDXDR...AAAAA=='),
    };
  }, TEST_PUBLIC_KEY);

  await page.goto('/issues');

  // Find the first issue card and click its Apply button
  const applyBtn = page.locator('[data-testid="apply-btn"]').first();
  await expect(applyBtn).toBeVisible();
  await applyBtn.click();

  // Assert success toast within 5 s
  await expect(page.locator('[data-testid="toast-success"]')).toBeVisible({ timeout: 5000 });

  // Assert button label changed to Withdraw
  await expect(applyBtn).toHaveText('Withdraw');
});
