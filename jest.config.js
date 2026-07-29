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
