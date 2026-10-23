/**
 * Drawer / sidebar navigation tests — issue #555
 *
 * Validates the mobile slide-out drawer at:
 *   375px (mobile) and 768px (tablet/desktop boundary)
 *
 * Acceptance criteria:
 *  ✓ Hamburger visible on viewport < 768px
 *  ✓ Drawer slides in when hamburger clicked
 *  ✓ Drawer closes when backdrop clicked
 *  ✓ Drawer closes when Escape key pressed
 *  ✓ Hamburger not visible at 768px
 */

import { test, expect, Page } from '@playwright/test';

/** Open the dashboard and wait for it to be interactive. */
async function openDashboard(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}

// ---------------------------------------------------------------------------
// Mobile drawer — 375px viewport
// ---------------------------------------------------------------------------

test.describe('Drawer — mobile (375px)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('hamburger button is visible on 375px viewport', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByTestId('hamburger-button')).toBeVisible();
  });

  test('drawer slides in when hamburger is clicked', async ({ page }) => {
    await openDashboard(page);
    const drawer = page.getByTestId('mobile-menu');

    // Drawer should not be visible before clicking
    await expect(drawer).not.toBeVisible();

    await page.getByTestId('hamburger-button').click();

    // Drawer should be visible after clicking
    await expect(drawer).toBeVisible();
  });

  test('drawer closes when backdrop is clicked', async ({ page }) => {
    await openDashboard(page);
    const drawer = page.getByTestId('mobile-menu');

    // Open the drawer
    await page.getByTestId('hamburger-button').click();
    await expect(drawer).toBeVisible();

    // Click the backdrop
    await page.getByTestId('drawer-backdrop').click();

    // Drawer should close
    await expect(drawer).not.toBeVisible();
  });

  test('drawer closes when Escape key is pressed', async ({ page }) => {
    await openDashboard(page);
    const drawer = page.getByTestId('mobile-menu');

    // Open the drawer
    await page.getByTestId('hamburger-button').click();
    await expect(drawer).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Drawer should close
    await expect(drawer).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Desktop — 768px viewport (hamburger should be hidden)
// ---------------------------------------------------------------------------

test.describe('Drawer — desktop boundary (768px)', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('hamburger button is not visible at 768px', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByTestId('hamburger-button')).toBeHidden();
  });
});
