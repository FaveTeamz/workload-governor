/**
 * Unit tests for connection pool configuration (issue #1035).
 */

const poolCtor = jest.fn();
const poolOn = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation((config: unknown) => {
    poolCtor(config);
    return { on: poolOn, totalCount: 3, idleCount: 1, waitingCount: 0, end: jest.fn() };
  }),
}));

jest.mock('node-pg-migrate', () => ({ default: jest.fn() }), { virtual: true });

const loggerMock = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
jest.mock('../../src/logger', () => ({ logger: loggerMock }));

const ENV_KEYS = [
  'DB_POOL_MIN',
  'DB_POOL_MAX',
  'DB_IDLE_TIMEOUT',
  'DB_CONNECTION_TIMEOUT',
  'DB_ACQUIRE_TIMEOUT',
] as const;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const loadDb = (): typeof import('../../src/db') => require('../../src/db');

describe('db pool configuration', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('uses idleTimeoutMillis=30000, connectionTimeoutMillis=5000, max=20 by default', () => {
    const { buildPoolConfig } = loadDb();
    expect(buildPoolConfig()).toMatchObject({
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  });

  it('passes the explicit settings to the pg Pool constructor', () => {
    loadDb();
    expect(poolCtor).toHaveBeenCalledWith(
      expect.objectContaining({ max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 }),
    );
  });

  it('honours environment variable overrides', () => {
    process.env['DB_POOL_MAX'] = '5';
    process.env['DB_IDLE_TIMEOUT'] = '10000';
    process.env['DB_CONNECTION_TIMEOUT'] = '2000';
    const { buildPoolConfig } = loadDb();
    expect(buildPoolConfig()).toMatchObject({
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 2000,
    });
  });

  it('accepts DB_ACQUIRE_TIMEOUT as a legacy alias', () => {
    process.env['DB_ACQUIRE_TIMEOUT'] = '7000';
    const { buildPoolConfig } = loadDb();
    expect(buildPoolConfig().connectionTimeoutMillis).toBe(7000);
  });

  it('falls back to defaults and warns on invalid values', () => {
    process.env['DB_POOL_MAX'] = 'abc';
    process.env['DB_IDLE_TIMEOUT'] = '-1';
    const { buildPoolConfig } = loadDb();
    const cfg = buildPoolConfig();
    expect(cfg.max).toBe(20);
    expect(cfg.idleTimeoutMillis).toBe(30000);
    expect(loggerMock.warn).toHaveBeenCalled();
  });

  it('clamps min so it never exceeds max', () => {
    process.env['DB_POOL_MAX'] = '3';
    process.env['DB_POOL_MIN'] = '10';
    const { buildPoolConfig } = loadDb();
    expect(buildPoolConfig()).toMatchObject({ min: 3, max: 3 });
  });

  it('registers a pool error handler that logs unexpected client disconnections', () => {
    loadDb();
    const errorCall = poolOn.mock.calls.find(([event]) => event === 'error');
    expect(errorCall).toBeDefined();

    const err = Object.assign(new Error('Connection terminated unexpectedly'), { code: '57P01' });
    expect(() => errorCall![1](err)).not.toThrow();
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Connection terminated unexpectedly',
        code: '57P01',
        pool: { total: 3, idle: 1, waiting: 0 },
      }),
    );
  });
});
