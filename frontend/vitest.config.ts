import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/unit/setup.ts'],
    include: ['tests/unit/**/*.test.tsx', 'tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov', 'json', 'json-summary'],
      reportsDirectory: './coverage/frontend',
      include: ['frontend/src/**/*.{ts,tsx}'],
      exclude: ['frontend/src/main.tsx'],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 75,
        statements: 75,
      },
    },
  },
  resolve: {
    alias: {
      '@': '/frontend/src',
    },
  },
});
