/**
 * tests/routes/setup.ts
 *
 * Jest setup for route integration tests.
 * Mocks Redis and the database pool so route tests run without
 * external services.
 */

// Mock dotenv/config (no .env file needed in test environment)
jest.mock('dotenv/config', () => ({}), { virtual: true });

// Mock the event indexer so importing index.ts doesn't start background jobs
jest.mock('../../src/eventIndexer', () => ({
  startEventIndexer: jest.fn().mockResolvedValue(undefined),
  registerShutdownHandlers: jest.fn(),
}));

// Mock Redis service
jest.mock('../../src/services/redis', () => ({
  __esModule: true,
  default: {
    on: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(60),
    quit: jest.fn().mockResolvedValue('OK'),
  },
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(undefined),
  invalidateCache: jest.fn().mockResolvedValue(undefined),
}));

// Mock the database pool
jest.mock('../../src/db', () => ({
  pool: {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    }),
    end: jest.fn(),
    on: jest.fn(),
    totalCount: 1,
    idleCount: 1,
    waitingCount: 0,
  },
  migrate: jest.fn().mockResolvedValue(undefined),
  healthCheck: jest.fn().mockResolvedValue({ status: 'ok', latency_ms: 1, pool: { active: 0, idle: 1, waiting: 0 } }),
}));
