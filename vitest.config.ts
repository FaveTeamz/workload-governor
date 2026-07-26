import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Root vitest config — runs vitest-compatible tests only.
//
// IMPORTANT: Most tests/unit/*.test.ts and all tests/api/**/*.test.ts are
// written with Jest APIs (jest.mock, jest.fn) and must run via `npm test`
// (Jest). Only the property-based tests and React component tests (.tsx)
// are included here.
//
// Backend TypeScript coverage is collected by Jest (see jest.config.js).
// Frontend component coverage is collected by frontend/vitest.config.ts.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Prevent multiple React instances when tests import from frontend/src/.
    // Both the root and frontend/ ship their own react — dedupe ensures a
    // single copy is used throughout the test run.
    dedupe: ['react', 'react-dom'],
  },
  test: {
    projects: [
      // ── Property-based tests (pure TS, no jest APIs) ────────────────────
      {
        extends: true,
        test: {
          name: 'prop',
          environment: 'node',
          globals: true,
          include: ['tests/unit/prop_*.test.ts'],
          setupFiles: ['./tests/unit/setup.ts'],
        },
      },

      // ── React component tests (jsdom env, Vitest APIs) ──────────────────
      {
        extends: true,
        test: {
          name: 'unit-jsdom',
          environment: 'jsdom',
          globals: true,
          include: ['tests/unit/**/*.test.tsx'],
          setupFiles: ['./tests/unit/setup.ts'],
        },
      },
    ],
  },
});
