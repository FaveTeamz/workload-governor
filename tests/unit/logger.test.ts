/**
 * tests/unit/logger.test.ts
 *
 * Unit tests for structured logging and correlation ID middleware.
 */

import { Request, Response, NextFunction } from 'express';
import { correlationIdMiddleware } from '../../src/logger';

// ---------------------------------------------------------------------------
// Minimal mock helpers
// ---------------------------------------------------------------------------

function mockReq(headers: Record<string, string> = {}): Partial<Request> & { correlationId?: string } {
  return {
    headers,
    method: 'GET',
    path: '/test',
  } as Partial<Request> & { correlationId?: string };
}

function mockRes(): Partial<Response> & { _headers: Record<string, string> } {
  const listeners: Record<string, Array<() => void>> = {};
  const res = {
    _headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this._headers[name.toLowerCase()] = value;
    },
    on(event: string, cb: () => void) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
      return this;
    },
    emit(event: string) {
      (listeners[event] ?? []).forEach((cb) => cb());
    },
    statusCode: 200,
  };
  return res as unknown as Partial<Response> & { _headers: Record<string, string> };
}

const mockNext: NextFunction = jest.fn();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('correlationIdMiddleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses client-supplied X-Correlation-Id header when present', () => {
    const clientId = 'my-trace-id-abc123';
    const req = mockReq({ 'x-correlation-id': clientId });
    const res = mockRes();

    correlationIdMiddleware(req as Request, res as Response, mockNext);

    expect(req.correlationId).toBe(clientId);
  });

  it('generates a UUID when no X-Correlation-Id header is present', () => {
    const req = mockReq();
    const res = mockRes();

    correlationIdMiddleware(req as Request, res as Response, mockNext);

    expect(req.correlationId).toBeDefined();
    // UUID v4 pattern
    expect(req.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('sets X-Correlation-Id response header', () => {
    const req = mockReq({ 'x-correlation-id': 'resp-id-123' });
    const res = mockRes();

    correlationIdMiddleware(req as Request, res as Response, mockNext);

    expect(res._headers['x-correlation-id']).toBe('resp-id-123');
  });

  it('sets X-Correlation-Id response header to generated ID when not supplied', () => {
    const req = mockReq();
    const res = mockRes();

    correlationIdMiddleware(req as Request, res as Response, mockNext);

    expect(res._headers['x-correlation-id']).toBe(req.correlationId);
  });

  it('calls next()', () => {
    const req = mockReq();
    const res = mockRes();

    correlationIdMiddleware(req as Request, res as Response, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('different requests get different correlation IDs when no header provided', () => {
    const req1 = mockReq();
    const req2 = mockReq();
    const res1 = mockRes();
    const res2 = mockRes();

    correlationIdMiddleware(req1 as Request, res1 as Response, mockNext);
    correlationIdMiddleware(req2 as Request, res2 as Response, mockNext);

    expect(req1.correlationId).not.toBe(req2.correlationId);
  });
});

describe('LOG_LEVEL env var', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('logger respects LOG_LEVEL=warn', async () => {
    process.env['LOG_LEVEL'] = 'warn';
    const { logger } = await import('../../src/logger');
    expect(logger.level).toBe('warn');
  });

  it('logger respects LOG_LEVEL=error', async () => {
    process.env['LOG_LEVEL'] = 'error';
    const { logger } = await import('../../src/logger');
    expect(logger.level).toBe('error');
  });
});
