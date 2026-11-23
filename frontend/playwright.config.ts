import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for responsive and visual regression tests.
 * Configured with 0.2% max pixel difference threshold (issue #1288).
 *
 * Viewport widths tested:
 *  375px  — iPhone SE (mobile small)
 *  414px  — iPhone XR (mobile large)
 *  768px  — iPad (tablet breakpoint)
 * 1024px  — desktop medium
 * 1280px  — desktop large
 */
export default defineConfig({
  testDir: './tests',
  testIgnore: '**/unit/**',
  timeout: 60000,
  fullyParallel: true,
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.002,
    },
  },
  snapshotPathTemplate: '{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}{ext}',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'mobile-375',
      use: {
        ...devices['iPhone SE'],
        viewport: { width: 375, height: 667 },
      },
    },
    {
      name: 'mobile-414',
      use: {
        ...devices['iPhone XR'],
        viewport: { width: 414, height: 896 },
      },
    },
    {
      name: 'tablet-768',
      use: {
        viewport: { width: 768, height: 1024 },
        isMobile: false,
      },
    },
    {
      name: 'desktop-1024',
      use: {
        viewport: { width: 1024, height: 768 },
        isMobile: false,
      },
    },
    {
      name: 'desktop-1280',
      use: {
        viewport: { width: 1280, height: 800 },
        isMobile: false,
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
