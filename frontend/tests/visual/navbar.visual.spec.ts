/**
 * Visual regression tests — Responsive Navigation Bar (issue #1288)
 *
 * Validates visual layout and appearance across viewports and color schemes:
 *   - Desktop (1280x720): Expanded navigation links, network badge, connected wallet.
 *   - Tablet (768x1024): Condensed view (desktop links visible, hamburger hidden).
 *   - Mobile (375x667): Closed hamburger menu and open mobile drawer overlay.
 *   - Both light mode and dark mode themes.
 *
 * Configured with 0.2% max pixel difference threshold (maxDiffPixelRatio: 0.002).
 */

import { test, expect, Page } from '@playwright/test';

const DEMO_WALLET = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

/** Helper to initialize page with theme, onboarding state, and optional wallet */
async function setupPage(
  page: Page,
  options: {
    theme: 'light' | 'dark';
    connectWallet?: boolean;
  }
) {
  await page.addInitScript(
    ({ theme, connectWallet, walletKey }) => {
      localStorage.setItem('wg_theme', theme);
      localStorage.setItem('wg_onboarding_done', '1');
      if (connectWallet) {
        localStorage.setItem('wg_wallet_pubkey', walletKey);
      } else {
        localStorage.removeItem('wg_wallet_pubkey');
      }
      document.documentElement.setAttribute('data-theme', theme);
    },
    {
      theme: options.theme,
      connectWallet: options.connectWallet ?? false,
      walletKey: DEMO_WALLET,
    }
  );

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded');

  // Ensure theme attribute is applied
  await page.evaluate((theme) => {
    document.documentElement.setAttribute('data-theme', theme);
  }, options.theme);

  // Ensure navigation bar is rendered
  const navbar = page.locator('nav[aria-label="Main navigation"]').first();
  await navbar.waitFor({ state: 'visible' });
  return navbar;
}

// ---------------------------------------------------------------------------
// Desktop (1280x720) — Expanded links, network badge, connected wallet
// ---------------------------------------------------------------------------

test.describe('NavBar visual regression — Desktop (1280x720)', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
  });

  test('desktop light mode matches baseline (connected wallet, network badge)', async ({
    page,
  }) => {
    await setupPage(page, { theme: 'light', connectWallet: true });

    // Verify elements are visible on desktop
    await expect(page.getByTestId('network-badge')).toBeVisible();
    await expect(page.getByTestId('wallet-status-dot')).toBeVisible();
    await expect(page.getByTestId('wallet-address')).toBeVisible();
    await expect(page.getByRole('button', { name: /disconnect wallet/i })).toBeVisible();

    // Hamburger button should be hidden on desktop
    const hamburger = page
      .getByTestId('hamburger-btn')
      .or(page.getByTestId('hamburger-button'));
    await expect(hamburger.first()).toBeHidden();

    // Visual snapshot comparison
    await expect(page).toHaveScreenshot('navbar-desktop-light.png', {
      maxDiffPixelRatio: 0.002,
    });
  });

  test('desktop dark mode matches baseline (connected wallet, network badge)', async ({
    page,
  }) => {
    await setupPage(page, { theme: 'dark', connectWallet: true });

    // Verify elements are visible on desktop
    await expect(page.getByTestId('network-badge')).toBeVisible();
    await expect(page.getByTestId('wallet-status-dot')).toBeVisible();
    await expect(page.getByTestId('wallet-address')).toBeVisible();
    await expect(page.getByRole('button', { name: /disconnect wallet/i })).toBeVisible();

    const hamburger = page
      .getByTestId('hamburger-btn')
      .or(page.getByTestId('hamburger-button'));
    await expect(hamburger.first()).toBeHidden();

    // Visual snapshot comparison
    await expect(page).toHaveScreenshot('navbar-desktop-dark.png', {
      maxDiffPixelRatio: 0.002,
    });
  });

  test('desktop default snapshot navbar-desktop.png', async ({ page }) => {
    await setupPage(page, { theme: 'dark', connectWallet: true });
    await expect(page).toHaveScreenshot('navbar-desktop.png', {
      maxDiffPixelRatio: 0.002,
    });
  });
});

// ---------------------------------------------------------------------------
// Tablet (768x1024) — Condensed view, links visible, hamburger hidden
// ---------------------------------------------------------------------------

test.describe('NavBar visual regression — Tablet (768x1024)', () => {
  test.use({
    viewport: { width: 768, height: 1024 },
  });

  test('tablet light mode matches baseline', async ({ page }) => {
    await setupPage(page, { theme: 'light', connectWallet: true });

    const hamburger = page
      .getByTestId('hamburger-btn')
      .or(page.getByTestId('hamburger-button'));
    await expect(hamburger.first()).toBeHidden();

    await expect(page).toHaveScreenshot('navbar-tablet-light.png', {
      maxDiffPixelRatio: 0.002,
    });
  });

  test('tablet dark mode matches baseline', async ({ page }) => {
    await setupPage(page, { theme: 'dark', connectWallet: true });

    const hamburger = page
      .getByTestId('hamburger-btn')
      .or(page.getByTestId('hamburger-button'));
    await expect(hamburger.first()).toBeHidden();

    await expect(page).toHaveScreenshot('navbar-tablet-dark.png', {
      maxDiffPixelRatio: 0.002,
    });
  });
});

// ---------------------------------------------------------------------------
// Mobile (375x667) — Closed hamburger & Open mobile drawer overlay
// ---------------------------------------------------------------------------

test.describe('NavBar visual regression — Mobile (375x667)', () => {
  test.use({
    viewport: { width: 375, height: 667 },
  });

  test('mobile light mode closed hamburger matches baseline', async ({
    page,
  }) => {
    await setupPage(page, { theme: 'light', connectWallet: true });

    const hamburger = page
      .getByTestId('hamburger-btn')
      .or(page.getByTestId('hamburger-button'));
    await expect(hamburger.first()).toBeVisible();

    await expect(page).toHaveScreenshot('navbar-mobile-closed-light.png', {
      maxDiffPixelRatio: 0.002,
    });
  });

  test('mobile dark mode closed hamburger matches baseline', async ({
    page,
  }) => {
    await setupPage(page, { theme: 'dark', connectWallet: true });

    const hamburger = page
      .getByTestId('hamburger-btn')
      .or(page.getByTestId('hamburger-button'));
    await expect(hamburger.first()).toBeVisible();

    await expect(page).toHaveScreenshot('navbar-mobile-closed-dark.png', {
      maxDiffPixelRatio: 0.002,
    });
  });

  test('mobile light mode open drawer overlay matches baseline', async ({
    page,
  }) => {
    await setupPage(page, { theme: 'light', connectWallet: true });

    const hamburger = page
      .getByTestId('hamburger-btn')
      .or(page.getByTestId('hamburger-button'));
    await hamburger.first().click();

    const drawer = page
      .getByTestId('mobile-drawer')
      .or(page.getByTestId('navbar-menu'));
    await expect(drawer.first()).toBeVisible();

    await expect(page).toHaveScreenshot('navbar-mobile-drawer-open-light.png', {
      maxDiffPixelRatio: 0.002,
    });
  });

  test('mobile dark mode open drawer overlay matches baseline', async ({
    page,
  }) => {
    await setupPage(page, { theme: 'dark', connectWallet: true });

    const hamburger = page
      .getByTestId('hamburger-btn')
      .or(page.getByTestId('hamburger-button'));
    await hamburger.first().click();

    const drawer = page
      .getByTestId('mobile-drawer')
      .or(page.getByTestId('navbar-menu'));
    await expect(drawer.first()).toBeVisible();

    await expect(page).toHaveScreenshot('navbar-mobile-drawer-open-dark.png', {
      maxDiffPixelRatio: 0.002,
    });
  });
});
