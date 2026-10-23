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
      moduleNameMapper: {
        '^@stellar/stellar-sdk$': '<rootDir>/__mocks__/@stellar/stellar-sdk.js',
        '^.*config/database$': '<rootDir>/__mocks__/src/config/database.js',
      },
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            tsconfig: '<rootDir>/tsconfig.dev.json',
            // TS2339 added: pre-existing 'property does not exist' error in
            // src/routes/admin.ts (registerMaintainer) that affects all API tests.
            // TS2352 added: pre-existing type assertion error in src/middleware/audit.ts.
            diagnostics: { ignoreCodes: ['TS2307', 'TS2305', 'TS7016', 'TS2554', 'TS7006', 'TS2339', 'TS2352'] },
          },
        ],
      },
    },
    {
      displayName: 'contract',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/contract/**/*.test.ts'],
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
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/tests/multi-org.test.ts',
        '<rootDir>/tests/integration/**/*.test.ts',
      ],
      moduleNameMapper: {
        '^@stellar/stellar-sdk$': '<rootDir>/__mocks__/@stellar/stellar-sdk.js',
      },
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            tsconfig: '<rootDir>/tsconfig.dev.json',
            diagnostics: {
              ignoreCodes: ['TS2307', 'TS2305', 'TS7016', 'TS2724', 'TS2345', 'TS2554', 'TS2339', 'TS2358', 'TS7006'],
            },
          },
        ],
      },
    },
  ],
};

