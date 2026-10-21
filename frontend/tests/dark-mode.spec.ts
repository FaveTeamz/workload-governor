/**
 * dark-mode.spec.ts
 *
 * Asserts that the correct CSS custom-property (token) values are applied
 * when the browser reports `prefers-color-scheme: dark`.
 *
 * Context: tokens.css uses `:root { }` for the DARK palette (the default)
 * and overrides only the semantic surface tokens inside
 * `@media (prefers-color-scheme: light)`. This means dark-mode is the
 * out-of-the-box behaviour, and these tests guard against a PR accidentally
 * clobbering a dark-mode token with a light value.
 *
 * Expected dark-mode token values (from frontend/src/tokens.css):
 *   --color-bg:      #0f1117
 *   --color-surface: #1c1f2b
 *   --color-border:  #2e3347
 *   --color-text:    #e2e8f0
 */

import { test, expect } from '@playwright/test'

// Force dark colour scheme for every test in this file.
test.use({ colorScheme: 'dark' })

test.beforeEach(async ({ page }) => {
  // Skip the onboarding overlay so it doesn't block UI elements.
  await page.addInitScript(() => {
    localStorage.setItem('wg_onboarding_done', '1')
  })
  await page.goto('/')
})

// ── Helper ─────────────────────────────────────────────────────────────────

/** Reads a CSS custom property from `el` using `getComputedStyle`. */
function getCSSVar(selector: string, prop: string) {
  return async ({ page }: { page: import('@playwright/test').Page }) => {
    const el = page.locator(selector).first()
    await expect(el).toBeVisible()
    return el.evaluate(
      (node, p) => getComputedStyle(node).getPropertyValue(p).trim(),
      prop,
    )
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

test('--color-bg is the dark value on the root element', async ({ page }) => {
  const value = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--color-bg')
      .trim(),
  )
  expect(value).toBe('#0f1117')
})

test('--color-surface is the dark value on the root element', async ({ page }) => {
  const value = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--color-surface')
      .trim(),
  )
  expect(value).toBe('#1c1f2b')
})

test('--color-border is the dark value on the root element', async ({ page }) => {
  const value = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--color-border')
      .trim(),
  )
  expect(value).toBe('#2e3347')
})

test('--color-text is the dark value on the root element', async ({ page }) => {
  const value = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--color-text')
      .trim(),
  )
  expect(value).toBe('#e2e8f0')
})

test('NavBar renders in dark mode with correct border token', async ({ page }) => {
  const navbar = page.locator('nav.navbar')
  await expect(navbar).toBeVisible()

  const border = await navbar.evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--color-border').trim(),
  )
  expect(border).toBe('#2e3347')
})

test('MaintainerPanel surface token is the dark value', async ({ page }) => {
  const panel = page.locator('.maintainer-panel')
  await expect(panel).toBeVisible()

  const surface = await panel.evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--color-surface').trim(),
  )
  expect(surface).toBe('#1c1f2b')
})

test('Gauge renders visibly in dark mode', async ({ page }) => {
  // The Gauge SVG is rendered inside a <figure class="gauge">
  const gauge = page.locator('figure.gauge').first()
  await expect(gauge).toBeVisible()

  // The track arc uses --color-border as its stroke
  const border = await gauge.evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--color-border').trim(),
  )
  expect(border).toBe('#2e3347')
})

test('CapacityBars render visibly in dark mode', async ({ page }) => {
  const capacityBars = page.locator('.capacity-bars')
  await expect(capacityBars).toBeVisible()

  const bg = await capacityBars.evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--color-bg').trim(),
  )
  expect(bg).toBe('#0f1117')
})

test('Toast success variant shows correct text token', async ({ page }) => {
  // Trigger a success toast by clicking the first Assign → Confirm flow
  const firstAssignBtn = page
    .locator('.panel-row .btn-primary:has-text("Assign")')
    .first()

  const hasAssignBtn = await firstAssignBtn.isVisible().catch(() => false)
  if (!hasAssignBtn) {
    // No assignable rows in current demo state — skip gracefully
    return
  }

  await firstAssignBtn.click()
  const confirmBtn = page
    .locator('.panel-row .btn-primary:has-text("Confirm")')
    .first()
  await expect(confirmBtn).toBeVisible()
  await confirmBtn.click()

  // A success toast should appear
  const toast = page.locator('.toast-success').first()
  await expect(toast).toBeVisible({ timeout: 5000 })

  const text = await toast.evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--color-text').trim(),
  )
  expect(text).toBe('#e2e8f0')
})

test('dark mode does not override light-mode values (sanity check)', async ({ page }) => {
  // In dark mode the light-mode @media overrides must NOT apply.
  // Light-mode sets --color-bg to #f8fafc; in dark mode it must stay #0f1117.
  const bg = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--color-bg')
      .trim(),
  )
  expect(bg).not.toBe('#f8fafc') // light-mode value
  expect(bg).toBe('#0f1117')      // dark-mode value
})
