import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Lightweight config for running unit tests only (no Storybook / browser project).
// Used by: npx vitest run --config vitest.unit.config.ts
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Ensure a single React copy is used — prevents "invalid hook call" errors
    // that arise when the source tree resolves React from frontend/node_modules
    // while testing-library resolves it from the root node_modules.
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    alias: {
      '@tokens': resolve(__dirname, 'frontend/src/tokens.json'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/unit/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['frontend/src/**/*.{ts,tsx}'],
    },
  },
});
