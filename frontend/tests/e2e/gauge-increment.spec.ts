/**
 * gauge-increment.spec.ts — issue #274
 *
 * Playwright e2e spec that verifies the Gauge component's fill progression,
 * color thresholds, and ARIA meter attributes as value increments.
 *
 * Runs against the Storybook dev server (http://localhost:6006) so no
 * running app backend is required.
 *
 * To run locally:
 *   cd frontend && npm run storybook &
 *   npx playwright test tests/e2e/gauge-increment.spec.ts
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to a specific Gauge story in Storybook */
async function gotoStory(page: import('@playwright/test').Page, storyId: string) {
  await page.goto(`http://localhost:6006/iframe.html?id=${storyId}&viewMode=story`)
  await page.waitForLoadState('networkidle')
}

// ---------------------------------------------------------------------------
// ARIA meter attributes
// ---------------------------------------------------------------------------

test.describe('Gauge ARIA meter attributes', () => {
  test('GlobalEmpty story has correct meter attributes (0/15)', async ({ page }) => {
    await gotoStory(page, 'design-system-gauge--global-empty')

    const meter = page.getByRole('meter')
    await expect(meter).toBeVisible()
    await expect(meter).toHaveAttribute('aria-valuenow', '0')
    await expect(meter).toHaveAttribute('aria-valuemin', '0')
    await expect(meter).toHaveAttribute('aria-valuemax', '15')
  })

  test('GlobalHalf story has correct meter attributes (7/15)', async ({ page }) => {
    await gotoStory(page, 'design-system-gauge--global-half')

    const meter = page.getByRole('meter')
    await expect(meter).toHaveAttribute('aria-valuenow', '7')
    await expect(meter).toHaveAttribute('aria-valuemax', '15')
  })

  test('GlobalFull story has correct meter attributes (15/15)', async ({ page }) => {
    await gotoStory(page, 'design-system-gauge--global-full')

    const meter = page.getByRole('meter')
    await expect(meter).toHaveAttribute('aria-valuenow', '15')
    await expect(meter).toHaveAttribute('aria-valuemax', '15')
  })

  test('OrgHalf story has correct meter attributes (2/4)', async ({ page }) => {
    await gotoStory(page, 'design-system-gauge--org-half')

    const meter = page.getByRole('meter')
    await expect(meter).toHaveAttribute('aria-valuenow', '2')
    await expect(meter).toHaveAttribute('aria-valuemax', '4')
  })

  test('OrgFull story has correct meter attributes (4/4)', async ({ page }) => {
    await gotoStory(page, 'design-system-gauge--org-full')

    const meter = page.getByRole('meter')
    await expect(meter).toHaveAttribute('aria-valuenow', '4')
    await expect(meter).toHaveAttribute('aria-valuemax', '4')
  })
})

// ---------------------------------------------------------------------------
// Fill percentage text
// ---------------------------------------------------------------------------

test.describe('Gauge fill percentage display', () => {
  test('GlobalEmpty shows 0%', async ({ page }) => {
    await gotoStory(page, 'design-system-gauge--global-empty')
    await expect(page.getByText('0%')).toBeVisible()
    await expect(page.getByText('0/15')).toBeVisible()
  })

  test('GlobalHalf shows 47%', async ({ page }) => {
    await gotoStory(page, 'design-system-gauge--global-half')
    await expect(page.getByText('47%')).toBeVisible()
    await expect(page.getByText('7/15')).toBeVisible()
  })

  test('GlobalYellow shows 60%', async ({ page }) => {
    await gotoStory(page, 'design-system-gauge--global-yellow')
    await expect(page.getByText('60%')).toBeVisible()
  })

  test('GlobalRed shows 87%', async ({ page }) => {
    await gotoStory(page, 'design-system-gauge--global-red')
    await expect(page.getByText('87%')).toBeVisible()
  })

  test('GlobalFull shows 100%', async ({ page }) => {
    await gotoStory(page, 'design-system-gauge--global-full')
    await expect(page.getByText('100%')).toBeVisible()
    await expect(page.getByText('15/15')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Color thresholds via CSS class
// ---------------------------------------------------------------------------

test.describe('Gauge color threshold classes', () => {
  test('GlobalEmpty (0%) has gauge--green class', async ({ page }) => {
    await gotoStory(page, 'design-system-gauge--global-empty')
    const meter = page.getByRole('meter')
    await expect(meter).toHaveClass(/gauge--green/)
  })

  test('GlobalHalf (47%) has gauge--green class', async ({ page }) => {
    await gotoStory(page, 'design-system-gauge--global-half')
    const meter = page.getByRole('meter')
    await expect(meter).toHaveClass(/gauge--green/)
  })

  test('GlobalYellow (60%) has gauge--yellow class', async ({ page }) => {
    await gotoStory(page, 'design-system-gauge--global-yellow')
    const meter = page.getByRole('meter')
    await expect(meter).toHaveClass(/gauge--yellow/)
  })

  test('GlobalRed (87%) has gauge--red class', async ({ page }) => {
    await gotoStory(page, 'design-system-gauge--global-red')
    const meter = page.getByRole('meter')
    await expect(meter).toHaveClass(/gauge--red/)
  })

  test('GlobalFull (100%) has gauge--red class', async ({ page }) => {
    await gotoStory(page, 'design-system-gauge--global-full')
    const meter = page.getByRole('meter')
    await expect(meter).toHaveClass(/gauge--red/)
  })

  test('OrgFull (100%) has gauge--red class', async ({ page }) => {
    await gotoStory(page, 'design-system-gauge--org-full')
    const meter = page.getByRole('meter')
    await expect(meter).toHaveClass(/gauge--red/)
  })
})

// ---------------------------------------------------------------------------
// Animation: fill arc is present and has transition applied
// ---------------------------------------------------------------------------

test.describe('Gauge animation on mount', () => {
  test('fill arc is present after mount for non-zero value', async ({ page }) => {
    await gotoStory(page, 'design-system-gauge--global-half')

    // The fill path should be in the DOM
    const fillPath = page.locator('.gauge__fill')
    await expect(fillPath).toBeAttached()
  })

  test('animated class is applied to fill arc', async ({ page }) => {
    await gotoStory(page, 'design-system-gauge--global-half')

    // After mount rAF fires, gauge__fill--animated class should be present
    const animatedFill = page.locator('.gauge__fill--animated')
    await expect(animatedFill).toBeAttached({ timeout: 2000 })
  })

  test('no fill arc when value is 0', async ({ page }) => {
    await gotoStory(page, 'design-system-gauge--global-empty')
    const fillPath = page.locator('.gauge__fill')
    await expect(fillPath).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------
// Responsive sizing
// ---------------------------------------------------------------------------

test.describe('Gauge responsive sizing', () => {
  test('SizeSmall story renders an SVG with width=200', async ({ page }) => {
    await gotoStory(page, 'design-system-gauge--size-small')
    const svg = page.locator('.gauge__svg')
    await expect(svg).toBeVisible()
    const width = await svg.getAttribute('width')
    expect(Number(width)).toBe(200)
  })

  test('SizeLarge story renders an SVG with width=400', async ({ page }) => {
    await gotoStory(page, 'design-system-gauge--size-large')
    const svg = page.locator('.gauge__svg')
    await expect(svg).toBeVisible()
    const width = await svg.getAttribute('width')
    expect(Number(width)).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// Fill progression: incrementing value changes fill arc strokeDashoffset
// ---------------------------------------------------------------------------

test.describe('Gauge fill progression', () => {
  test('strokeDashoffset decreases as value increases from 0 to 15', async ({ page }) => {
    // Start with GlobalEmpty (0/15)
    await gotoStory(page, 'design-system-gauge--global-empty')
    // No fill arc at 0
    await expect(page.locator('.gauge__fill')).toHaveCount(0)

    // GlobalHalf (7/15) should have a fill arc with smaller offset (more filled)
    await gotoStory(page, 'design-system-gauge--global-half')
    await page.waitForTimeout(100) // allow rAF
    const halfOffset = await page.locator('.gauge__fill--animated').getAttribute('stroke-dashoffset')

    // GlobalFull (15/15) should have offset ≈ 0
    await gotoStory(page, 'design-system-gauge--global-full')
    await page.waitForTimeout(100)
    const fullOffset = await page.locator('.gauge__fill--animated').getAttribute('stroke-dashoffset')

    expect(Number(halfOffset)).toBeGreaterThan(Number(fullOffset))
  })
})
