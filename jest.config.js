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
  // Redirect stellar-sdk to our lightweight CJS manual mock so Jest doesn't
  // need to parse its ESM-only sub-dependencies (@noble/hashes etc.)
  moduleNameMapper: {
    '^@stellar/stellar-sdk$': '<rootDir>/__mocks__/@stellar/stellar-sdk.js',
  },
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
      moduleNameMapper: {
        '^@stellar/stellar-sdk$': '<rootDir>/__mocks__/@stellar/stellar-sdk.js',
      },
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            tsconfig: '<rootDir>/tsconfig.dev.json',
            diagnostics: {
              ignoreCodes: ['TS2307', 'TS2305', 'TS7016', 'TS2724', 'TS2345', 'TS2554', 'TS2339', 'TS2358'],
            },
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
      setupFilesAfterEnv: ['<rootDir>/tests/api/jest.setup.ts'],
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            tsconfig: '<rootDir>/tsconfig.dev.json',
            diagnostics: { ignoreCodes: ['TS2307', 'TS2305', 'TS7016', 'TS2554', 'TS7006'] },
          },
        ],
      },
    },
  ],
};
