/**
 * drawer.spec.ts — Playwright E2E tests for the mobile navigation drawer
 * (issue #17).
 *
 * Tests run on a 375 × 667 viewport to simulate a mobile device.
 * All selectors target data-testid attributes for stability.
 *
 * Acceptance criteria verified:
 *  ✓ Drawer opens/closes correctly on mobile
 *  ✓ Keyboard navigation works fully (focus trap, Escape key)
 *  ✓ No layout issues on screen widths below 480 px
 */

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Mobile viewport helper
// ---------------------------------------------------------------------------

function setMobile(page: import('@playwright/test').Page) {
  return page.setViewportSize({ width: 375, height: 667 });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('Mobile navigation drawer', () => {
  test.beforeEach(async ({ page }) => {
    await setMobile(page);
    await page.goto('/');
  });

  // ── Test 1: hamburger visible on mobile, desktop nav hidden ────────────
  test('hamburger button is visible on mobile; desktop nav is hidden', async ({ page }) => {
    const hamburger = page.getByTestId('hamburger-button');
    await expect(hamburger).toBeVisible();

    // Desktop nav list should be hidden (CSS: hidden md:flex)
    const desktopNav = page.locator('ul.hidden.md\\:flex');
    await expect(desktopNav).toBeHidden();
  });

  // ── Test 2: drawer opens on hamburger click ────────────────────────────
  test('drawer opens when hamburger is clicked', async ({ page }) => {
    await page.getByTestId('hamburger-button').click();

    const drawer = page.getByTestId('mobile-drawer');
    await expect(drawer).toBeVisible();

    const backdrop = page.getByTestId('drawer-backdrop');
    await expect(backdrop).toBeVisible();
  });

  // ── Test 3: drawer closes on backdrop click ────────────────────────────
  test('drawer closes when backdrop is clicked', async ({ page }) => {
    await page.getByTestId('hamburger-button').click();
    await expect(page.getByTestId('mobile-drawer')).toBeVisible();

    await page.getByTestId('drawer-backdrop').click();

    await expect(page.getByTestId('mobile-drawer')).not.toBeVisible();
    await expect(page.getByTestId('drawer-backdrop')).not.toBeVisible();
  });

  // ── Test 4: drawer closes when a nav link is clicked ──────────────────
  test('drawer closes when a navigation link is clicked', async ({ page }) => {
    await page.getByTestId('hamburger-button').click();
    await expect(page.getByTestId('mobile-drawer')).toBeVisible();

    // Click any nav link inside the drawer
    const firstLink = page.getByTestId('mobile-drawer').getByRole('link').first();
    await firstLink.click();

    await expect(page.getByTestId('mobile-drawer')).not.toBeVisible();
  });

  // ── Test 5: drawer closes on Escape key ───────────────────────────────
  test('drawer closes when Escape is pressed', async ({ page }) => {
    await page.getByTestId('hamburger-button').click();
    await expect(page.getByTestId('mobile-drawer')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('mobile-drawer')).not.toBeVisible();
  });

  // ── Test 6: drawer close button works ─────────────────────────────────
  test('drawer close button closes the drawer', async ({ page }) => {
    await page.getByTestId('hamburger-button').click();
    await expect(page.getByTestId('mobile-drawer')).toBeVisible();

    await page.getByTestId('drawer-close-button').click();

    await expect(page.getByTestId('mobile-drawer')).not.toBeVisible();
  });

  // ── Test 7: first focusable element is the close button ───────────────
  test('focus moves to the close button when drawer opens', async ({ page }) => {
    await page.getByTestId('hamburger-button').click();
    await expect(page.getByTestId('mobile-drawer')).toBeVisible();

    // Give useFocusTrap's rAF a chance to run
    await page.waitForTimeout(100);

    const focusedTestId = await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.dataset?.testid ?? '',
    );
    expect(focusedTestId).toBe('drawer-close-button');
  });

  // ── Test 8: keyboard focus stays inside drawer (Tab wraps) ─────────────
  test('Tab key does not move focus outside the drawer', async ({ page }) => {
    await page.getByTestId('hamburger-button').click();
    await expect(page.getByTestId('mobile-drawer')).toBeVisible();
    await page.waitForTimeout(100);

    // Count focusable elements inside the drawer
    const focusableCount = await page.evaluate(() => {
      const drawer = document.querySelector('[data-testid="mobile-drawer"]');
      if (!drawer) return 0;
      return drawer.querySelectorAll(
        'button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ).length;
    });

    // Tab through all focusable elements + one more (should wrap back to first)
    for (let i = 0; i < focusableCount + 1; i++) {
      await page.keyboard.press('Tab');
    }

    // Active element must still be inside the drawer
    const isInsideDrawer = await page.evaluate(() => {
      const drawer = document.querySelector('[data-testid="mobile-drawer"]');
      return drawer?.contains(document.activeElement) ?? false;
    });
    expect(isInsideDrawer).toBe(true);
  });

  // ── Test 9: no layout overflow at 375 px width ────────────────────────
  test('no horizontal overflow at 375 px viewport', async ({ page }) => {
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    // Allow a couple of pixels of tolerance for sub-pixel rendering
    expect(bodyScrollWidth).toBeLessThanOrEqual(380);
  });

  // ── Test 10: drawer width does not exceed 85 vw ───────────────────────
  test('open drawer fits within 85 vw', async ({ page }) => {
    await page.getByTestId('hamburger-button').click();
    await expect(page.getByTestId('mobile-drawer')).toBeVisible();

    const drawerWidth = await page.getByTestId('mobile-drawer').evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    const viewportWidth = 375;
    expect(drawerWidth).toBeLessThanOrEqual(viewportWidth * 0.86); // 85 vw + 1 px tolerance
  });
});
