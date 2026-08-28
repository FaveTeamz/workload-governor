/**
 * Responsive layout tests — issue #318
 *
 * Validates the dashboard at five viewport widths:
 *   375px, 414px (mobile), 768px (tablet), 1024px, 1280px (desktop)
 *
 * Acceptance criteria:
 *  ✓ Navigation hamburger visible on mobile, hidden on desktop
 *  ✓ Mobile menu opens and closes via hamburger button
 *  ✓ TxConfirmModal renders as bottom sheet on mobile
 *  ✓ EventHistoryTable renders as card list on mobile, table on desktop
 *  ✓ Issue card grid is 1-column on mobile, 3-column on desktop
 *  ✓ All interactive touch targets are ≥ 44×44 px (WCAG 2.5.5)
 *  ✓ Swipe-to-dismiss gesture closes modal on mobile
 */

import { test, expect, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Open the dashboard and wait for it to be interactive. */
async function openDashboard(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}

/** Get the computed bounding box of an element and assert min 44×44 px. */
async function assertTouchTarget(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `touch target too small: ${selector}`).not.toBeNull();
  expect(box!.width, `${selector} width < 44px`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${selector} height < 44px`).toBeGreaterThanOrEqual(44);
}

// ---------------------------------------------------------------------------
// Navigation — hamburger menu
// ---------------------------------------------------------------------------

test.describe('Navigation — mobile (< 768px)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('hamburger button is visible on 375px', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByTestId('hamburger-button')).toBeVisible();
  });

  test('desktop nav links are not visible on 375px', async ({ page }) => {
    await openDashboard(page);
    // The desktop ul uses hidden md:flex — should not be visible at 375px
    const desktopNav = page.locator('nav ul').first();
    await expect(desktopNav).toBeHidden();
  });

  test('clicking hamburger opens the mobile drawer', async ({ page }) => {
    await openDashboard(page);
    const hamburger = page.getByTestId('hamburger-button');
    await expect(page.getByTestId('mobile-drawer')).not.toBeVisible();
    await hamburger.click();
    await expect(page.getByTestId('mobile-drawer')).toBeVisible();
  });

  test('clicking hamburger again closes the mobile drawer', async ({ page }) => {
    await openDashboard(page);
    const hamburger = page.getByTestId('hamburger-button');
    await hamburger.click();
    await expect(page.getByTestId('mobile-drawer')).toBeVisible();
    await hamburger.click();
    await expect(page.getByTestId('mobile-drawer')).not.toBeVisible();
  });

  test('hamburger button meets 44×44 px touch target requirement', async ({ page }) => {
    await openDashboard(page);
    await assertTouchTarget(page, '[data-testid="hamburger-button"]');
  });
});

test.describe('Navigation — mobile (414px)', () => {
  test.use({ viewport: { width: 414, height: 896 } });

  test('hamburger button is visible at 414px', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByTestId('hamburger-button')).toBeVisible();
  });

  test('mobile drawer opens and closes at 414px', async ({ page }) => {
    await openDashboard(page);
    const hamburger = page.getByTestId('hamburger-button');
    await hamburger.click();
    await expect(page.getByTestId('mobile-drawer')).toBeVisible();
    await hamburger.click();
    await expect(page.getByTestId('mobile-drawer')).not.toBeVisible();
  });
});

test.describe('Navigation — tablet (768px)', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('hamburger button is NOT visible at 768px', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByTestId('hamburger-button')).toBeHidden();
  });

  test('desktop nav links are visible at 768px', async ({ page }) => {
    await openDashboard(page);
    // The md:flex nav list should be visible
    const navLinks = page.locator('nav a[href="/issues"]').first();
    await expect(navLinks).toBeVisible();
  });
});

test.describe('Navigation — desktop (1024px)', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('hamburger button is not visible at 1024px', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByTestId('hamburger-button')).toBeHidden();
  });
});

test.describe('Navigation — desktop (1280px)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('hamburger button is not visible at 1280px', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByTestId('hamburger-button')).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// TxConfirmModal — bottom sheet on mobile, centered on desktop
// ---------------------------------------------------------------------------

test.describe('TxConfirmModal — mobile bottom sheet (375px)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('modal renders as bottom sheet (drag handle visible)', async ({ page }) => {
    await openDashboard(page);

    // Open modal via the Apply button on the first issue card
    const applyButton = page.locator('[data-testid="issue-card"] button').first();
    await applyButton.click();

    await expect(page.getByTestId('tx-modal')).toBeVisible();
    // Bottom-sheet drag handle is visible on mobile
    await expect(page.getByTestId('modal-bottom-sheet')).toBeVisible();
  });

  test('modal close button meets touch target requirement', async ({ page }) => {
    await openDashboard(page);
    const applyButton = page.locator('[data-testid="issue-card"] button').first();
    await applyButton.click();
    await expect(page.getByTestId('tx-modal')).toBeVisible();
    await assertTouchTarget(page, '[aria-label="Close modal"]');
  });

  test('modal closes when close button is clicked', async ({ page }) => {
    await openDashboard(page);
    const applyButton = page.locator('[data-testid="issue-card"] button').first();
    await applyButton.click();
    await expect(page.getByTestId('tx-modal')).toBeVisible();
    await page.getByLabel('Close modal').click();
    await expect(page.getByTestId('tx-modal')).not.toBeVisible();
  });

  test('swipe-to-dismiss closes modal when swiped down ≥ 80px', async ({ page }) => {
    await openDashboard(page);
    const applyButton = page.locator('[data-testid="issue-card"] button').first();
    await applyButton.click();
    await expect(page.getByTestId('tx-modal')).toBeVisible();

    const modal = page.getByTestId('tx-modal');
    const box = await modal.boundingBox();
    expect(box).not.toBeNull();

    const startX = box!.x + box!.width / 2;
    const startY = box!.y + 30; // near the top of the sheet

    // Simulate swipe down by 100px (above the 80px threshold)
    await page.touchscreen.tap(startX, startY);
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY + 100, { steps: 10 });
    await page.mouse.up();

    // Modal should be dismissed
    await expect(page.getByTestId('tx-modal')).not.toBeVisible();
  });

  test('pressing Escape closes the modal', async ({ page }) => {
    await openDashboard(page);
    const applyButton = page.locator('[data-testid="issue-card"] button').first();
    await applyButton.click();
    await expect(page.getByTestId('tx-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tx-modal')).not.toBeVisible();
  });
});

test.describe('TxConfirmModal — centered dialog (1024px)', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('modal drag handle is NOT visible at desktop width', async ({ page }) => {
    await openDashboard(page);
    const applyButton = page.locator('[data-testid="issue-card"] button').first();
    await applyButton.click();
    await expect(page.getByTestId('tx-modal')).toBeVisible();
    // Drag handle has md:hidden class — should not be visible at 1024px
    await expect(page.getByTestId('modal-bottom-sheet')).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// EventHistoryTable — card list on mobile, table on desktop
// ---------------------------------------------------------------------------

test.describe('EventHistoryTable — mobile card list (375px)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('event card list is visible on mobile', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByTestId('event-card-list')).toBeVisible();
  });

  test('event table is not visible on mobile', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByTestId('event-table')).toBeHidden();
  });
});

test.describe('EventHistoryTable — desktop table (1024px)', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('event table is visible on desktop', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByTestId('event-table')).toBeVisible();
  });

  test('event card list is not visible on desktop', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByTestId('event-card-list')).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// Issue card grid — column count
// ---------------------------------------------------------------------------

test.describe('Issue card grid — 1-column on mobile (375px)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('cards stack in a single column on 375px', async ({ page }) => {
    await openDashboard(page);
    const grid = page.getByTestId('issue-card-grid');
    await expect(grid).toBeVisible();

    // All cards should have the same left offset (single column)
    const cards = page.getByTestId('issue-card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    const boxes = await Promise.all(
      Array.from({ length: count }, (_, i) => cards.nth(i).boundingBox())
    );
    const leftOffsets = boxes.map((b) => Math.round(b?.x ?? 0));
    // In a 1-column grid all cards share the same x offset
    expect(new Set(leftOffsets).size).toBe(1);
  });
});

test.describe('Issue card grid — 3-column on desktop (1280px)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('cards render in three columns on 1280px', async ({ page }) => {
    await openDashboard(page);
    const cards = page.getByTestId('issue-card');
    const count = await cards.count();
    // Need at least 3 cards to verify 3 columns
    expect(count).toBeGreaterThanOrEqual(3);

    const boxes = await Promise.all(
      Array.from({ length: Math.min(count, 3) }, (_, i) => cards.nth(i).boundingBox())
    );
    // In a 3-column grid the first three cards each have a different x position
    const leftOffsets = boxes.map((b) => Math.round(b?.x ?? 0));
    expect(new Set(leftOffsets).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Touch targets — all interactive elements ≥ 44×44 px
// ---------------------------------------------------------------------------

test.describe('Touch targets — WCAG 2.5.5 compliance (375px)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('Apply buttons meet 44px minimum', async ({ page }) => {
    await openDashboard(page);
    const applyButtons = page.locator('[data-testid="issue-card"] button');
    const count = await applyButtons.count();
    for (let i = 0; i < count; i++) {
      const box = await applyButtons.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
  });

  test('hamburger button meets 44px minimum', async ({ page }) => {
    await openDashboard(page);
    await assertTouchTarget(page, '[data-testid="hamburger-button"]');
  });
});
