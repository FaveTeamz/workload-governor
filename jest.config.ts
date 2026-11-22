import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          // Tests can import from src without strict unused-vars checks
          noUnusedLocals: false,
          noUnusedParameters: false,
        },
      },
    ],
  },
  clearMocks: true,
  restoreMocks: true,
  fakeTimers: {
    // Individual tests opt-in via jest.useFakeTimers()
    enableGlobally: false,
  },
};

export default config;
