import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@tokens': resolve(__dirname, 'src/tokens.json') },
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
