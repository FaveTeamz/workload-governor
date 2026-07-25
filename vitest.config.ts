import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';

const dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react()],
  test: {
    // ── Backend coverage ─────────────────────────────────────────────────
    // Activated when running `npm run coverage:backend` (vitest --project backend).
    // Uses Istanbul via @vitest/coverage-istanbul; output goes to coverage/backend/.
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage/backend',
      include: [
        'src/**/*.{ts,js}',
      ],
      exclude: [
        'src/index.ts',
        'src/pages/**',
        'src/EventHistoryTable.js',
        'src/**/*.rs',
        'src/test.rs',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },

    projects: [
      // ── Backend project (Node env — API & unit tests) ─────────────────
      {
        extends: true,
        test: {
          name: 'backend',
          environment: 'node',
          globals: true,
          include: [
            'tests/unit/**/*.test.ts',
            'tests/api/**/*.test.ts',
            'backend/src/**/*.test.ts',
          ],
          setupFiles: ['./tests/unit/setup.ts'],
        },
      },

      // ── Frontend project (jsdom env — React component tests) ──────────
      // Coverage for frontend tests is handled by frontend/vitest.config.ts.
      {
        extends: true,
        test: {
          name: 'frontend',
          environment: 'jsdom',
          globals: true,
          include: ['tests/unit/**/*.test.{ts,tsx}'],
          setupFiles: ['./tests/unit/setup.ts'],
        },
      },

      // ── Storybook project (Playwright/Chromium) ────────────────────────
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(dirname, '.storybook'),
          }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
