/**
 * onboarding-wizard.spec.ts — closes #812
 *
 * E2E Playwright tests for the OnboardingWizard component.
 *
 * Scenarios:
 *  1. Happy path — navigate through all 5 wizard steps and complete onboarding
 *  2. Step navigation — Back returns to previous step; Next advances forward
 *  3. Wallet not connected guard — wizard shows Connect Your Wallet step
 *  4. Skip / already onboarded — wizard does not re-show after completion
 *  5. Escape closes wizard (non-permanent) — wizard can be reopened
 *  6. MSW mock — API calls within wizard flow are intercepted by MSW
 *
 * MSW handlers follow the pattern established in tests/e2e/msw-handlers.ts.
 * Tests target both Chromium and Firefox via the projects defined in
 * frontend/playwright.config.ts.
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants — mirror frontend/src/components/OnboardingWizard.tsx
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'wg_onboarding_done';

/** Step titles as they appear in the DOM (aria-labelledby="onboarding-title"). */
const STEP_TITLES = [
  'Welcome to WorkloadGovernor',
  'Install Freighter Wallet',
  'Connect Your Wallet',
  'Understanding the Cap System',
  'Browse Open Issues',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to the root page with onboarding localStorage cleared so the
 * wizard always shows on load.
 */
async function openWithWizardVisible(page: Page) {
  await page.addInitScript((key: string) => {
    localStorage.removeItem(key);
  }, STORAGE_KEY);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}

/** Inject MSW-compatible fetch mocks for any API calls the wizard may make. */
async function injectMswMocks(page: Page) {
  await page.addInitScript(() => {
    // Patch fetch to intercept any API calls during wizard flow.
    // The wizard itself does not make API calls, but some parent components
    // (e.g. contributor counts) might. Return empty/default responses.
    const _originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/contributors') && url.includes('/counts')) {
        return new Response(
          JSON.stringify({ totalApplications: 0, totalAssignments: 0, byOrganization: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/api/issues')) {
        return new Response(
          JSON.stringify({ issues: [], total: 0, page: 1, limit: 10, totalPages: 1 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return _originalFetch(input, init);
    };
  });
}

/** Get the wizard dialog. */
function getDialog(page: Page) {
  return page.getByRole('dialog', { name: /workloadgovernor/i }).or(
    page.locator('[role="dialog"][aria-modal="true"]'),
  );
}

/** Get the primary Next / Finish button inside the wizard. */
function getNextButton(page: Page) {
  return page.getByRole('button', { name: /next step|finish onboarding|get started|i have freighter|browse issues/i });
}

/** Get the Back button inside the wizard. */
function getBackButton(page: Page) {
  return page.getByRole('button', { name: /go to previous step/i });
}

// ---------------------------------------------------------------------------
// Scenario 1 — Happy path: navigate all 5 steps and complete
// ---------------------------------------------------------------------------

test.describe('OnboardingWizard — happy path', () => {
  test('completes all 5 steps and dismisses the wizard', async ({ page }) => {
    await injectMswMocks(page);
    await openWithWizardVisible(page);

    // Step 1: Welcome
    await expect(page.getByText(STEP_TITLES[0])).toBeVisible();

    // Step 2
    await getNextButton(page).click();
    await expect(page.getByText(STEP_TITLES[1])).toBeVisible();

    // Step 3
    await getNextButton(page).click();
    await expect(page.getByText(STEP_TITLES[2])).toBeVisible();

    // Step 4
    await getNextButton(page).click();
    await expect(page.getByText(STEP_TITLES[3])).toBeVisible();

    // Step 5
    await getNextButton(page).click();
    await expect(page.getByText(STEP_TITLES[4])).toBeVisible();

    // Finish
    await getNextButton(page).click();

    // Wizard should be gone
    await expect(page.locator('[role="dialog"][aria-modal="true"]')).not.toBeVisible();

    // localStorage should have the done flag
    const done = await page.evaluate((key: string) => localStorage.getItem(key), STORAGE_KEY);
    expect(done).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — Step navigation: Back returns to previous step
// ---------------------------------------------------------------------------

test.describe('OnboardingWizard — step navigation', () => {
  test('Next advances to the next step', async ({ page }) => {
    await injectMswMocks(page);
    await openWithWizardVisible(page);

    await expect(page.getByText(STEP_TITLES[0])).toBeVisible();
    await getNextButton(page).click();
    await expect(page.getByText(STEP_TITLES[1])).toBeVisible();
  });

  test('Back button returns to the previous step', async ({ page }) => {
    await injectMswMocks(page);
    await openWithWizardVisible(page);

    // Advance to step 2
    await getNextButton(page).click();
    await expect(page.getByText(STEP_TITLES[1])).toBeVisible();

    // Go back to step 1
    await getBackButton(page).click();
    await expect(page.getByText(STEP_TITLES[0])).toBeVisible();
  });

  test('Back button is not visible on step 1', async ({ page }) => {
    await injectMswMocks(page);
    await openWithWizardVisible(page);

    // On step 1, Back should not be present
    await expect(page.getByRole('button', { name: /go to previous step/i })).not.toBeVisible();
  });

  test('Skip button is not visible on step 1 but appears from step 2 onward', async ({ page }) => {
    await injectMswMocks(page);
    await openWithWizardVisible(page);

    // Step 1 — no Skip
    await expect(page.getByRole('button', { name: /skip/i })).not.toBeVisible();

    // Step 2 — Skip appears
    await getNextButton(page).click();
    await expect(page.getByRole('button', { name: /skip/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — Wallet not connected guard
// ---------------------------------------------------------------------------

test.describe('OnboardingWizard — wallet not connected', () => {
  test('wizard displays the Connect Your Wallet step when navigated to it', async ({ page }) => {
    await injectMswMocks(page);
    await openWithWizardVisible(page);

    // Navigate to step 3 (Connect Your Wallet)
    await getNextButton(page).click(); // → step 2
    await getNextButton(page).click(); // → step 3

    await expect(page.getByText('Connect Your Wallet')).toBeVisible();
    await expect(page.getByText(/click connect in the top navigation/i)).toBeVisible();
  });

  test('wizard is shown to unauthenticated users (no wallet in localStorage)', async ({ page }) => {
    await injectMswMocks(page);
    // No wallet — just clear onboarding flag and load
    await page.addInitScript((key: string) => {
      localStorage.removeItem(key);
      // Ensure no wallet address is stored
      localStorage.removeItem('walletAddress');
    }, STORAGE_KEY);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wizard should be visible for unauthenticated users
    await expect(page.locator('[role="dialog"][aria-modal="true"]')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — Skip / already onboarded
// ---------------------------------------------------------------------------

test.describe('OnboardingWizard — already onboarded', () => {
  test('wizard does not show when wg_onboarding_done is set', async ({ page }) => {
    await injectMswMocks(page);
    await page.addInitScript((key: string) => {
      localStorage.setItem(key, '1');
    }, STORAGE_KEY);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[role="dialog"][aria-modal="true"]')).not.toBeVisible();
  });

  test('Skip permanently dismisses the wizard and sets localStorage', async ({ page }) => {
    await injectMswMocks(page);
    await openWithWizardVisible(page);

    // Advance past step 1 so Skip is available
    await getNextButton(page).click();
    await expect(page.getByRole('button', { name: /skip/i })).toBeVisible();
    await page.getByRole('button', { name: /skip/i }).click();

    // Wizard should close
    await expect(page.locator('[role="dialog"][aria-modal="true"]')).not.toBeVisible();

    // localStorage should record permanent dismissal
    const done = await page.evaluate((key: string) => localStorage.getItem(key), STORAGE_KEY);
    expect(done).toBe('1');
  });

  test('reloading after completion does not re-show the wizard', async ({ page }) => {
    await injectMswMocks(page);
    await page.addInitScript((key: string) => {
      localStorage.setItem(key, '1');
    }, STORAGE_KEY);
    await page.goto('/');
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[role="dialog"][aria-modal="true"]')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — Escape closes wizard (non-permanent)
// ---------------------------------------------------------------------------

test.describe('OnboardingWizard — Escape key', () => {
  test('Escape closes the wizard without setting the done flag', async ({ page }) => {
    await injectMswMocks(page);
    await openWithWizardVisible(page);

    await expect(page.locator('[role="dialog"][aria-modal="true"]')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.locator('[role="dialog"][aria-modal="true"]')).not.toBeVisible();

    // localStorage should NOT be set (non-permanent close)
    const done = await page.evaluate((key: string) => localStorage.getItem(key), STORAGE_KEY);
    expect(done).toBeNull();
  });

  test('close button (✕) dismisses wizard without setting done flag', async ({ page }) => {
    await injectMswMocks(page);
    await openWithWizardVisible(page);

    await page.getByRole('button', { name: /close onboarding dialog/i }).click();

    await expect(page.locator('[role="dialog"][aria-modal="true"]')).not.toBeVisible();

    const done = await page.evaluate((key: string) => localStorage.getItem(key), STORAGE_KEY);
    expect(done).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — MSW mock: API calls are intercepted
// ---------------------------------------------------------------------------

test.describe('OnboardingWizard — MSW mock', () => {
  test('API calls during wizard flow are mocked and do not fail', async ({ page }) => {
    const apiErrors: string[] = [];

    page.on('response', (response) => {
      if (response.url().includes('/api/') && response.status() >= 400) {
        apiErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    await injectMswMocks(page);
    await openWithWizardVisible(page);

    // Walk through the full wizard
    for (let i = 0; i < STEP_TITLES.length - 1; i++) {
      await getNextButton(page).click();
    }
    await getNextButton(page).click(); // finish

    // No API requests should have returned 4xx/5xx during the wizard flow
    expect(apiErrors).toHaveLength(0);
  });

  test('wizard progress bar reflects the correct step percentage', async ({ page }) => {
    await injectMswMocks(page);
    await openWithWizardVisible(page);

    // Progress bar should be at 20% on step 1 (1/5 * 100)
    const progressBar = page.locator('.onboarding-progress__fill');
    await expect(progressBar).toBeVisible();
    const width = await progressBar.evaluate((el: HTMLElement) => el.style.width);
    expect(width).toBe('20%');
  });
});
