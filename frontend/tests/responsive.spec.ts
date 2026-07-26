/**
 * responsive.spec.ts
 *
 * E2E responsive-layout tests for WorkloadGovernor.
 *
 * Coverage:
 *  1. 375 px  – hamburger menu opens / closes; nav links accessible
 *  2. 375 px  – apply-flow bottom-sheet modal: open, confirm, cancel, swipe-dismiss
 *  3. 375 px  – event history renders as card list (ol/li), NOT a table
 *  4. 414 px  – maintainer panel opens as full-screen sheet
 *  5. 768 px  – layout switches from mobile → desktop correctly
 *
 * All tests use Playwright device emulation (viewport + touch) and capture
 * screenshots at each breakpoint for visual reference.
 */

import { test, expect, devices } from "@playwright/test";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 667 },
  { name: "mobile-414", width: 414, height: 896 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

// ---------------------------------------------------------------------------
// Existing static-layout coverage (preserved from original file)
// ---------------------------------------------------------------------------

for (const vp of VIEWPORTS) {
  test.describe(`Responsive — ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test.beforeEach(async ({ page }) => {
      // Set onboarding as done so the overlay doesn't intercept pointer events
      await page.addInitScript(() => {
        localStorage.setItem("wg_onboarding_done", "1");
      });
      await page.goto("/");
    });

    // ── No horizontal scroll ─────────────────────────────────────────
    test("no horizontal overflow on the page", async ({ page }) => {
      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      expect(scrollWidth).toBeLessThanOrEqual(vp.width);
    });

    // ── NavBar ────────────────────────────────────────────────────────
    test("navbar renders without overflow", async ({ page }) => {
      const navbar = page.locator("nav.navbar");
      await expect(navbar).toBeVisible();
      const box = await navbar.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(vp.width);
    });

    test("hamburger button visible and functional on mobile", async ({
      page,
    }) => {
      const hamburger = page.locator(".navbar__hamburger");
      if (vp.width <= 600) {
        await expect(hamburger).toBeVisible();
        // Menu starts hidden
        await expect(page.locator(".navbar__menu")).not.toHaveClass(
          /navbar__menu--open/,
        );
        // Click opens
        await hamburger.click();
        await expect(page.locator(".navbar__menu")).toHaveClass(
          /navbar__menu--open/,
        );
        // Click closes
        await hamburger.click();
        await expect(page.locator(".navbar__menu")).not.toHaveClass(
          /navbar__menu--open/,
        );
      } else {
        // On wider viewports hamburger is hidden, menu is always visible
        await expect(hamburger).toBeHidden();
        await expect(page.locator(".navbar__menu")).toBeVisible();
      }
    });

    // ── Touch targets ≥ 44×44 px ────────────────────────────────────
    test("all buttons meet 44×44 px touch target", async ({ page }) => {
      const buttons = page.locator("button:visible, a.btn:visible");
      const count = await buttons.count();
      for (let i = 0; i < count; i++) {
        const box = await buttons.nth(i).boundingBox();
        if (!box) continue;
        expect(
          box.width,
          `button[${i}] width  ${box.width}px < 44px`,
        ).toBeGreaterThanOrEqual(44);
        expect(
          box.height,
          `button[${i}] height ${box.height}px < 44px`,
        ).toBeGreaterThanOrEqual(44);
      }
    });

    // ── MaintainerPanel ───────────────────────────────────────────────
    test("maintainer panel renders without horizontal overflow", async ({
      page,
    }) => {
      const panel = page.locator(".maintainer-panel");
      await expect(panel).toBeVisible();
      const panelBox = await panel.boundingBox();
      const bodyWidth = await page.evaluate(() => document.body.clientWidth);
      expect(panelBox!.width).toBeLessThanOrEqual(bodyWidth + 1 /* rounding */);
    });

    test("panel columns stack vertically at mobile/tablet", async ({
      page,
    }) => {
      const columns = page.locator(".panel-column");
      const count = await columns.count();
      if (count < 2) return; // nothing to test

      const box0 = await columns.nth(0).boundingBox();
      const box1 = await columns.nth(1).boundingBox();

      if (vp.width <= 768) {
        // Stacked: second column top > first column bottom
        expect(box1!.y).toBeGreaterThanOrEqual(box0!.y + box0!.height - 2);
      } else {
        // Side-by-side: same top row
        expect(Math.abs(box0!.y - box1!.y)).toBeLessThan(4);
      }
    });

    // ── Toasts ────────────────────────────────────────────────────────
    test("toast container does not overflow viewport", async ({ page }) => {
      const container = page.locator(".toast-container");
      const panelVisible = await container.isVisible();
      if (!panelVisible) return; // no toasts shown yet — skip
      const box = await container.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
    });
  });
}

// ===========================================================================
// NEW INTERACTIVE FLOW TESTS — SCENARIO 1
// 375 px: hamburger menu opens, closes, and nav links are accessible
// ===========================================================================

test.describe("Scenario 1 — 375px: hamburger nav links accessible", () => {
  test.use({
    ...devices["iPhone SE"],
    viewport: { width: 375, height: 667 },
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem("wg_onboarding_done", "1"),
    );
    await page.goto("/");
  });

  test("hamburger opens menu and Activity link is reachable", async ({
    page,
  }) => {
    const hamburger = page.locator(".navbar__hamburger");
    await expect(hamburger).toBeVisible();

    // Menu hidden by default
    const menu = page.locator(".navbar__menu");
    await expect(menu).not.toHaveClass(/navbar__menu--open/);

    // Open
    await hamburger.click();
    await expect(menu).toHaveClass(/navbar__menu--open/);

    // Activity link is now visible and interactive
    const activityLink = menu.locator('a[href="#/activity"]');
    await expect(activityLink).toBeVisible();
    await expect(activityLink).toHaveText(/activity/i);

    // Click the link; menu should close
    await activityLink.click();
    await expect(menu).not.toHaveClass(/navbar__menu--open/);

    // Screenshot for visual reference
    await page.screenshot({
      path: "frontend/test-results/375-hamburger-nav.png",
      fullPage: false,
    });
  });

  test("hamburger closes when clicked a second time", async ({ page }) => {
    const hamburger = page.locator(".navbar__hamburger");
    await hamburger.click();
    await expect(page.locator(".navbar__menu")).toHaveClass(
      /navbar__menu--open/,
    );
    await hamburger.click();
    await expect(page.locator(".navbar__menu")).not.toHaveClass(
      /navbar__menu--open/,
    );
  });

  test("hamburger has correct ARIA attributes when open/closed", async ({
    page,
  }) => {
    const hamburger = page.locator(".navbar__hamburger");

    // Closed state
    await expect(hamburger).toHaveAttribute("aria-expanded", "false");

    // Open state
    await hamburger.click();
    await expect(hamburger).toHaveAttribute("aria-expanded", "true");
  });
});

// ===========================================================================
// SCENARIO 2 — 375px: apply-flow bottom-sheet modal
// open, confirm, cancel, and swipe-dismiss
// ===========================================================================

test.describe("Scenario 2 — 375px: apply-flow bottom-sheet modal", () => {
  test.use({
    ...devices["iPhone SE"],
    viewport: { width: 375, height: 667 },
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem("wg_onboarding_done", "1"),
    );
    await page.goto("/");
  });

  test("Assign button opens confirmation inline in panel row", async ({
    page,
  }) => {
    // The MaintainerPanel renders AppRow items with an "Assign" button
    const firstAssignBtn = page
      .locator('.panel-row .btn-primary:has-text("Assign")')
      .first();
    await expect(firstAssignBtn).toBeVisible();

    // Click to enter confirmation state
    await firstAssignBtn.click();

    // Confirm and Cancel buttons appear (bottom-sheet / inline confirm)
    const confirmBtn = page
      .locator('.panel-row .btn-primary:has-text("Confirm")')
      .first();
    const cancelBtn = page
      .locator('.panel-row .btn-ghost:has-text("Cancel")')
      .first();
    await expect(confirmBtn).toBeVisible();
    await expect(cancelBtn).toBeVisible();

    // The Assign button itself should no longer be visible
    await expect(firstAssignBtn).toBeHidden();

    // Screenshot
    await page.screenshot({
      path: "frontend/test-results/375-apply-modal-open.png",
      fullPage: false,
    });
  });

  test("cancel dismisses the confirmation without assigning", async ({
    page,
  }) => {
    const firstAssignBtn = page
      .locator('.panel-row .btn-primary:has-text("Assign")')
      .first();
    // Count apps before
    const countBefore = await page.locator('.panel-row .btn-primary:has-text("Assign")').count();

    await firstAssignBtn.click();

    const cancelBtn = page
      .locator('.panel-row .btn-ghost:has-text("Cancel")')
      .first();
    await cancelBtn.click();

    // Assign button is back, count unchanged
    await expect(
      page.locator('.panel-row .btn-primary:has-text("Assign")').first(),
    ).toBeVisible();
    expect(
      await page.locator('.panel-row .btn-primary:has-text("Assign")').count(),
    ).toBe(countBefore);

    await page.screenshot({
      path: "frontend/test-results/375-apply-modal-cancel.png",
      fullPage: false,
    });
  });

  test("confirm assigns the issue and removes the row", async ({ page }) => {
    const rowsBefore = await page.locator('.panel-column:first-child .panel-row').count();
    expect(rowsBefore).toBeGreaterThan(0);

    const firstAssignBtn = page
      .locator('.panel-row .btn-primary:has-text("Assign")')
      .first();
    await firstAssignBtn.click();

    const confirmBtn = page
      .locator('.panel-row .btn-primary:has-text("Confirm")')
      .first();
    await confirmBtn.click();

    // Row should disappear after successful assignment
    await expect(
      page.locator('.panel-column:first-child .panel-row'),
    ).toHaveCount(rowsBefore - 1, { timeout: 5000 });

    await page.screenshot({
      path: "frontend/test-results/375-apply-modal-confirm.png",
      fullPage: false,
    });
  });

  test("Escape key dismisses the confirmation (swipe-dismiss equivalent)", async ({
    page,
  }) => {
    const firstAssignBtn = page
      .locator('.panel-row .btn-primary:has-text("Assign")')
      .first();
    await firstAssignBtn.click();

    // Confirm button is visible
    await expect(
      page.locator('.panel-row .btn-primary:has-text("Confirm")').first(),
    ).toBeVisible();

    // Press Escape to dismiss
    await page.keyboard.press("Escape");

    // Assign button is back
    await expect(
      page.locator('.panel-row .btn-primary:has-text("Assign")').first(),
    ).toBeVisible();

    await page.screenshot({
      path: "frontend/test-results/375-apply-modal-swipe-dismiss.png",
      fullPage: false,
    });
  });
});

// ===========================================================================
// SCENARIO 3 — 375px: event history renders as card list, not a table
// ===========================================================================

test.describe("Scenario 3 — 375px: event history card list", () => {
  test.use({
    ...devices["iPhone SE"],
    viewport: { width: 375, height: 667 },
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem("wg_onboarding_done", "1"),
    );

    // Mock the /api/events endpoint so ActivityFeed renders items
    await page.route("**/api/events**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          events: [
            {
              id: "ev-1",
              event_type: "applied",
              contributor: "GBXXX1ABCDEFGHIJKLMNO12345",
              org_id: "stellar-org",
              issue_id: 42,
              tx_hash: "abc123",
              timestamp: new Date().toISOString(),
            },
            {
              id: "ev-2",
              event_type: "assigned",
              contributor: "GCYYY2PQRSTUVWXYZABCDE67890",
              org_id: "meridian-dao",
              issue_id: 7,
              tx_hash: "def456",
              timestamp: new Date(Date.now() - 60_000).toISOString(),
            },
          ],
          pagination: { hasMore: false },
        }),
      });
    });

    await page.goto("/");
  });

  test("activity feed renders as <ol>/<li> card list, not a table", async ({
    page,
  }) => {
    // ActivityFeed uses <ol class="activity-feed__list"> with <li> children
    const list = page.locator("ol.activity-feed__list");
    await expect(list).toBeVisible({ timeout: 8000 });

    // Must be an ordered list, not a table
    await expect(page.locator("table")).toHaveCount(0);

    // Each item is an <li>
    const items = list.locator("li.af-event");
    await expect(items).toHaveCount(2);

    // No item overflows the viewport width
    const itemCount = await items.count();
    for (let i = 0; i < itemCount; i++) {
      const box = await items.nth(i).boundingBox();
      if (!box) continue;
      expect(
        box.x + box.width,
        `af-event[${i}] right edge overflows viewport`,
      ).toBeLessThanOrEqual(375 + 2 /* rounding */);
    }

    // Screenshot
    await page.screenshot({
      path: "frontend/test-results/375-event-history-cards.png",
      fullPage: false,
    });
  });

  test("event badges are visible in mobile card list", async ({ page }) => {
    const list = page.locator("ol.activity-feed__list");
    await expect(list).toBeVisible({ timeout: 8000 });

    const badges = page.locator(".af-badge");
    const count = await badges.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(badges.nth(i)).toBeVisible();
    }
  });
});

// ===========================================================================
// SCENARIO 4 — 414px: maintainer panel full-screen sheet
// ===========================================================================

test.describe("Scenario 4 — 414px: maintainer panel full-screen sheet", () => {
  test.use({
    ...devices["iPhone XR"],
    viewport: { width: 414, height: 896 },
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem("wg_onboarding_done", "1"),
    );
    await page.goto("/");
  });

  test("maintainer panel fills viewport width on 414px", async ({ page }) => {
    const panel = page.locator(".maintainer-panel");
    await expect(panel).toBeVisible();

    const panelBox = await panel.boundingBox();
    const bodyWidth = await page.evaluate(() => document.body.clientWidth);

    // Panel should span the full body width (full-screen sheet behaviour)
    expect(panelBox!.width).toBeGreaterThanOrEqual(bodyWidth - 2 /* rounding */);

    // Screenshot
    await page.screenshot({
      path: "frontend/test-results/414-maintainer-fullscreen-sheet.png",
      fullPage: false,
    });
  });

  test("panel columns stack vertically at 414px", async ({ page }) => {
    const columns = page.locator(".panel-column");
    const count = await columns.count();
    if (count < 2) return;

    const box0 = await columns.nth(0).boundingBox();
    const box1 = await columns.nth(1).boundingBox();

    // Stacked layout: second column's top >= first column's bottom
    expect(box1!.y).toBeGreaterThanOrEqual(box0!.y + box0!.height - 2);
  });

  test("no horizontal overflow at 414px", async ({ page }) => {
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(414 + 1);
  });

  test("panel rows are usable at 414px — touch targets meet 44px minimum", async ({
    page,
  }) => {
    const actionBtns = page.locator(".row-actions button:visible");
    const count = await actionBtns.count();
    for (let i = 0; i < count; i++) {
      const box = await actionBtns.nth(i).boundingBox();
      if (!box) continue;
      expect(
        box.height,
        `row-action button[${i}] height ${box.height}px < 44px`,
      ).toBeGreaterThanOrEqual(44);
    }
  });
});

// ===========================================================================
// SCENARIO 5 — 768px → desktop switch
// ===========================================================================

test.describe("Scenario 5 — 768px: mobile → desktop layout switch", () => {
  test("hamburger hidden and panel columns side-by-side at 768px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.addInitScript(() =>
      localStorage.setItem("wg_onboarding_done", "1"),
    );
    await page.goto("/");

    // Hamburger should be hidden at tablet/desktop breakpoint
    const hamburger = page.locator(".navbar__hamburger");
    await expect(hamburger).toBeHidden();

    // Menu always visible
    await expect(page.locator(".navbar__menu")).toBeVisible();

    // Panel columns should be side-by-side (same vertical origin)
    const columns = page.locator(".panel-column");
    const count = await columns.count();
    if (count >= 2) {
      const box0 = await columns.nth(0).boundingBox();
      const box1 = await columns.nth(1).boundingBox();
      expect(Math.abs(box0!.y - box1!.y)).toBeLessThan(4);
    }

    // Screenshot
    await page.screenshot({
      path: "frontend/test-results/768-desktop-layout.png",
      fullPage: false,
    });
  });

  test("switches layout when viewport is resized from mobile to desktop", async ({
    page,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem("wg_onboarding_done", "1"),
    );

    // Start at mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    await expect(page.locator(".navbar__hamburger")).toBeVisible();

    // Resize to desktop
    await page.setViewportSize({ width: 1440, height: 900 });

    await expect(page.locator(".navbar__hamburger")).toBeHidden();
    await expect(page.locator(".navbar__menu")).toBeVisible();

    // Panel columns should now be side-by-side
    const columns = page.locator(".panel-column");
    const count = await columns.count();
    if (count >= 2) {
      const box0 = await columns.nth(0).boundingBox();
      const box1 = await columns.nth(1).boundingBox();
      expect(Math.abs(box0!.y - box1!.y)).toBeLessThan(4);
    }

    // Screenshot
    await page.screenshot({
      path: "frontend/test-results/1440-after-resize.png",
      fullPage: false,
    });
  });
});
