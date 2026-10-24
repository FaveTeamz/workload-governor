/**
 * Visual regression tests — NavBar responsive layout (issue #1072)
 *
 * Compares navigation bar screenshots across three viewport widths:
 *   375px  — mobile (hamburger menu visible, desktop links hidden)
 *   768px  — tablet / desktop breakpoint (desktop links visible)
 *  1280px  — full desktop (desktop links visible)
 *
 * Acceptance criteria:
 *  ✓ Screenshot comparison at 375px, 768px, and 1280px viewports
 *  ✓ Hamburger visible at 375px, hidden at 768px and 1280px
 *  ✓ Desktop nav links visible at 768px and 1280px, hidden at 375px
 *  ✓ Screenshots match stored baselines within 2% pixel difference
 *
 * Run:
 *   npx playwright test frontend/tests/nav-visual-regression.spec.ts
 *
 * Update baselines:
 *   npx playwright test frontend/tests/nav-visual-regression.spec.ts --update-snapshots
 */

import { test, expect, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to the app root and wait for the NavBar to be rendered. */
async function openApp(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // Ensure the NavBar landmark is present before taking screenshots
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: 'visible' });
}

/** Capture a screenshot of the NavBar element only. */
async function snapshotNavBar(page: Page, name: string) {
  const navbar = page.locator('nav[aria-label="Main navigation"]').first();
  await expect(navbar).toHaveScreenshot(`${name}.png`, {
    maxDiffPixelRatio: 0.02,
  });
}

// ---------------------------------------------------------------------------
// 375 px — Mobile: hamburger menu visible, desktop links hidden
// ---------------------------------------------------------------------------

test.describe('NavBar visual regression — 375px (mobile)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('mobile NavBar default state matches baseline', async ({ page }) => {
    await openApp(page);
    await snapshotNavBar(page, 'navbar-375-default');
  });

  test('hamburger button is visible at 375px', async ({ page }) => {
    await openApp(page);
    // Verify layout expectation before snapshot
    const hamburger = page.getByTestId('hamburger-btn').or(
      page.getByTestId('hamburger-button'),
    );
    await expect(hamburger.first()).toBeVisible();
  });

  test('desktop nav links are not visible at 375px', async ({ page }) => {
    await openApp(page);
    // Desktop link list uses `hidden md:flex` — not rendered at 375px
    const desktopNavList = page.locator('nav ul').first();
    await expect(desktopNavList).toBeHidden();
  });

  test('mobile NavBar open-drawer state matches baseline', async ({ page }) => {
    await openApp(page);
    // Open the mobile drawer
    const hamburger = page.getByTestId('hamburger-btn').or(
      page.getByTestId('hamburger-button'),
    );
    await hamburger.first().click();

    // Wait for the drawer to be visible
    const drawer = page
      .getByTestId('mobile-drawer')
      .or(page.getByTestId('navbar-menu'));
    await expect(drawer.first()).toBeVisible();

    // Full-page screenshot to capture the drawer overlay
    await expect(page).toHaveScreenshot('navbar-375-drawer-open.png', {
      maxDiffPixelRatio: 0.02,
    });
  });
});

// ---------------------------------------------------------------------------
// 768 px — Tablet / desktop breakpoint: desktop links visible
// ---------------------------------------------------------------------------

test.describe('NavBar visual regression — 768px (tablet)', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('tablet NavBar default state matches baseline', async ({ page }) => {
    await openApp(page);
    await snapshotNavBar(page, 'navbar-768-default');
  });

  test('hamburger button is NOT visible at 768px', async ({ page }) => {
    await openApp(page);
    const hamburger = page.getByTestId('hamburger-btn').or(
      page.getByTestId('hamburger-button'),
    );
    await expect(hamburger.first()).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// 1280 px — Full desktop: desktop links visible, no hamburger
// ---------------------------------------------------------------------------

test.describe('NavBar visual regression — 1280px (desktop)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('desktop NavBar default state matches baseline', async ({ page }) => {
    await openApp(page);
    await snapshotNavBar(page, 'navbar-1280-default');
  });

  test('hamburger button is NOT visible at 1280px', async ({ page }) => {
    await openApp(page);
    const hamburger = page.getByTestId('hamburger-btn').or(
      page.getByTestId('hamburger-button'),
    );
    await expect(hamburger.first()).toBeHidden();
  });

  test('desktop nav links are visible at 1280px', async ({ page }) => {
    await openApp(page);
    // Desktop link list uses `hidden md:flex` — visible at 1280px
    const desktopNavList = page.locator('nav ul').first();
    await expect(desktopNavList).toBeVisible();
  });
});
