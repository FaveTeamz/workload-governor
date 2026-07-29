/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/**/*.rs',
    '!src/pages/**',
    '!src/EventHistoryTable.js',
  ],
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
  },
  coverageReporters: ['text', 'lcov'],
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            tsconfig: '<rootDir>/tsconfig.dev.json',
            diagnostics: { ignoreCodes: ['TS2307', 'TS2305', 'TS7016'] },
          },
        ],
      },
    },
    {
      displayName: 'api',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/api/**/*.test.ts'],
      globalSetup: '<rootDir>/tests/api/setup.ts',
      // Redirect @noble/hashes from the nested ESM-only v2 copy inside
      // @stellar/stellar-sdk to the top-level CJS-compatible v1 copy so that
      // Jest (running in CommonJS mode) can load it without an ESM error.
      moduleNameMapper: {
        '^@noble/hashes/(.*)$': '<rootDir>/node_modules/@noble/hashes/$1',
      },
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            tsconfig: '<rootDir>/tsconfig.dev.json',
            diagnostics: { ignoreCodes: ['TS2307', 'TS2305', 'TS7016'] },
          },
        ],
      },
    },
  ],
};
