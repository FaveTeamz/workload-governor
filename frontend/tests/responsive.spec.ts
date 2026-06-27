import { test, expect } from "@playwright/test";

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 667 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

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
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(vp.width);
    });

    // ── NavBar ────────────────────────────────────────────────────────
    test("navbar renders without overflow", async ({ page }) => {
      const navbar = page.locator("nav.navbar");
      await expect(navbar).toBeVisible();
      const box = await navbar.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(vp.width);
    });

    test("hamburger button visible and functional on mobile", async ({ page }) => {
      const hamburger = page.locator(".navbar__hamburger");
      if (vp.width <= 600) {
        await expect(hamburger).toBeVisible();
        // Menu starts hidden
        await expect(page.locator(".navbar__menu")).not.toHaveClass(/navbar__menu--open/);
        // Click opens
        await hamburger.click();
        await expect(page.locator(".navbar__menu")).toHaveClass(/navbar__menu--open/);
        // Click closes
        await hamburger.click();
        await expect(page.locator(".navbar__menu")).not.toHaveClass(/navbar__menu--open/);
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
        expect(box.width,  `button[${i}] width  ${box.width}px < 44px`).toBeGreaterThanOrEqual(44);
        expect(box.height, `button[${i}] height ${box.height}px < 44px`).toBeGreaterThanOrEqual(44);
      }
    });

    // ── MaintainerPanel ───────────────────────────────────────────────
    test("maintainer panel renders without horizontal overflow", async ({ page }) => {
      const panel = page.locator(".maintainer-panel");
      await expect(panel).toBeVisible();
      const panelBox = await panel.boundingBox();
      const bodyWidth = await page.evaluate(() => document.body.clientWidth);
      expect(panelBox!.width).toBeLessThanOrEqual(bodyWidth + 1 /* rounding */);
    });

    test("panel columns stack vertically at mobile/tablet", async ({ page }) => {
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
