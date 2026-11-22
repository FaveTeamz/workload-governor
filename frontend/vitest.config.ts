import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@tokens': resolve(__dirname, 'src/tokens.json') },
  },
  css: {
    // Disable PostCSS processing in the test environment so missing plugins
    // (e.g. tailwindcss) don't break test runs.  CSS class names are not
    // tested for correctness, only DOM structure.
    postcss: { plugins: [] },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],

    // ── Coverage (Istanbul) ────────────────────────────────────────────
    // Run with: npm run coverage  (inside frontend/)
    // Generates: frontend/coverage/lcov.info (uploaded to Codecov as 'frontend' flag)
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.stories.{ts,tsx}',
        'src/stories/**',
        'src/assets/**',
        'src/main.tsx',
        'src/test-setup.ts',
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 75,
        statements: 75,
      },
    },
  },
});
