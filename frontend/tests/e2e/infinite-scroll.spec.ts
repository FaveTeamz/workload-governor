/**
 * infinite-scroll.spec.ts — issue #532
 *
 * Playwright e2e spec that verifies the OrgIssuesPage infinite scroll behaviour:
 *
 *  1. First page (20 issues max) loads on mount.
 *  2. Scrolling to the bottom triggers a second page fetch.
 *  3. Skeleton cards are visible during the fetch delay.
 *  4. When total issues < 20 (single page), scroll sentinel is absent and
 *     the "all issues loaded" message is shown immediately.
 *  5. "All issues loaded" footer appears once all pages are exhausted.
 *
 * The tests run against the dev server (http://localhost:3000) but mock the
 * `/api/orgs/:orgId/issues` endpoint via Playwright's route interception so
 * no live backend is required.
 *
 * To run locally:
 *   cd frontend && npm run dev &
 *   npx playwright test tests/e2e/infinite-scroll.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORG_ID = 'stellar-org';
const PAGE_URL = `http://localhost:3000/orgs/${ORG_ID}/issues`;

/** Build a minimal issue object for a given index */
function makeIssue(index: number) {
  return {
    issue_id: `issue-${index}`,
    org_id: ORG_ID,
    title: `Issue title number ${index}`,
    status: 'open',
    reward_xlm: 10,
    created_at: new Date(2026, 0, index + 1).toISOString(),
  };
}

/** Generate an array of `count` issues starting from `startIndex` */
function makeIssues(startIndex: number, count: number) {
  return Array.from({ length: count }, (_, i) => makeIssue(startIndex + i));
}

const PAGE_SIZE = 20;
const FULL_PAGE  = makeIssues(0, PAGE_SIZE);
const SECOND_PAGE = makeIssues(PAGE_SIZE, PAGE_SIZE);
const PARTIAL_PAGE = makeIssues(0, 5); // fewer than PAGE_SIZE → only one page

// ---------------------------------------------------------------------------
// Route interceptor factory
// ---------------------------------------------------------------------------

/**
 * Intercept GET /api/orgs/:orgId/issues requests and respond with pages from
 * the provided `pages` array.  The first call gets pages[0], the second
 * pages[1], etc.  Calls beyond the supplied pages get an empty array.
 *
 * A configurable `delayMs` can be used to keep skeletons on screen long
 * enough for assertions.
 */
async function setupIssuesMock(
  page: Page,
  pages: unknown[][],
  delayMs = 0,
) {
  let callIndex = 0;
  await page.route(`**/api/orgs/${ORG_ID}/issues**`, async (route: Route) => {
    const data = pages[callIndex] ?? [];
    callIndex++;
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data),
    });
  });

  // Stub contributor endpoints so cap logic doesn't make extra noise
  await page.route('**/api/contributors/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }));
}

// ---------------------------------------------------------------------------
// Tests: first page on mount
// ---------------------------------------------------------------------------

test.describe('Infinite scroll — first page load', () => {
  test('renders 20 issues on mount from first page', async ({ page }) => {
    await setupIssuesMock(page, [FULL_PAGE]);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('networkidle');

    // All 20 issue titles should be in the DOM
    for (let i = 0; i < PAGE_SIZE; i++) {
      await expect(page.getByText(`Issue title number ${i}`)).toBeVisible();
    }
  });

  test('scroll sentinel is present when a full page was returned', async ({ page }) => {
    await setupIssuesMock(page, [FULL_PAGE, []]);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-testid="scroll-sentinel"]')).toBeAttached();
  });

  test('works correctly when total issues < 20 (single page)', async ({ page }) => {
    await setupIssuesMock(page, [PARTIAL_PAGE]);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('networkidle');

    // Only 5 issue cards should be present
    for (let i = 0; i < 5; i++) {
      await expect(page.getByText(`Issue title number ${i}`)).toBeVisible();
    }

    // No sentinel — no more pages
    await expect(page.locator('[data-testid="scroll-sentinel"]')).not.toBeAttached();
  });

  test('shows "all issues loaded" immediately for single-page results', async ({ page }) => {
    await setupIssuesMock(page, [PARTIAL_PAGE]);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/all issues loaded/i)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests: scroll-to-load
// ---------------------------------------------------------------------------

test.describe('Infinite scroll — scroll to load next page', () => {
  test('scrolling to bottom triggers next page fetch and appends issues', async ({ page }) => {
    await setupIssuesMock(page, [FULL_PAGE, SECOND_PAGE, []]);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('networkidle');

    // First page is rendered
    await expect(page.getByText('Issue title number 0')).toBeVisible();

    // Scroll to bottom to trigger IntersectionObserver
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // Second page issues should appear
    await expect(page.getByText(`Issue title number ${PAGE_SIZE}`)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('shows "all issues loaded" after second page exhausts results', async ({ page }) => {
    // Second page has fewer than PAGE_SIZE — no third page expected
    const shortSecondPage = makeIssues(PAGE_SIZE, 3);
    await setupIssuesMock(page, [FULL_PAGE, shortSecondPage]);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('networkidle');

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    await expect(page.getByText(/all issues loaded/i)).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Tests: skeleton loader
// ---------------------------------------------------------------------------

test.describe('Infinite scroll — skeleton loader', () => {
  test('skeleton cards are shown while next page is loading', async ({ page }) => {
    // Delay the second page by 400 ms so we can assert on skeletons
    const DELAY = 400;
    let callIndex = 0;
    const pages = [FULL_PAGE, SECOND_PAGE, []];

    await page.route(`**/api/orgs/${ORG_ID}/issues**`, async (route: Route) => {
      const data = pages[callIndex] ?? [];
      const isSecondPage = callIndex === 1;
      callIndex++;
      if (isSecondPage) {
        await new Promise((resolve) => setTimeout(resolve, DELAY));
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(data),
      });
    });
    await page.route('**/api/contributors/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    }));

    await page.goto(PAGE_URL);
    await page.waitForLoadState('networkidle');

    // Scroll to trigger next page
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // During the delay, skeleton cards should be present
    await expect(page.locator('.issue-card--skeleton').first()).toBeVisible({ timeout: 2000 });

    // After load completes, skeleton should be gone
    await expect(page.locator('.issue-card--skeleton').first()).not.toBeVisible({
      timeout: DELAY + 2000,
    });
  });

  test('initial skeleton rows appear before first page loads', async ({ page }) => {
    let resolve!: () => void;
    const blocker = new Promise<void>((res) => { resolve = res; });

    await page.route(`**/api/orgs/${ORG_ID}/issues**`, async (route: Route) => {
      await blocker;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(FULL_PAGE),
      });
    });
    await page.route('**/api/contributors/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    }));

    await page.goto(PAGE_URL);

    // Skeleton rows (org-issue-row--skeleton) should be visible before data arrives
    await expect(page.locator('.org-issue-row--skeleton').first()).toBeVisible({ timeout: 3000 });

    // Unblock and wait for real content
    resolve();
    await expect(page.getByText('Issue title number 0')).toBeVisible({ timeout: 5000 });
  });
});
