import { Request, Response, NextFunction } from 'express';
import { errorHandler, ContractError, HorizonError, ValidationError } from '../../src/errors';

function mockReqRes() {
  const req = { correlationId: 'test-corr' } as Request;
  const json = jest.fn();
  const res = { status: jest.fn().mockReturnValue({ json }) } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, json, status: (res.status as jest.Mock), next };
}

describe('errorHandler middleware', () => {
  beforeEach(() => { delete process.env.NODE_ENV; });

  it('returns 400 with VALIDATION_ERROR for ValidationError', () => {
    const { req, res, status, json } = mockReqRes();
    errorHandler(new ValidationError('bad input', { field: 'x' }), req, res, jest.fn());
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'VALIDATION_ERROR', message: 'bad input' }),
    }));
  });

  it('returns 403 for ContractError code 3 (UnauthorizedAdmin)', () => {
    const { req, res, status } = mockReqRes();
    errorHandler(new ContractError(3, 'unauthorized'), req, res, jest.fn());
    expect(status).toHaveBeenCalledWith(403);
  });

  it('returns 409 for ContractError code 8 (DuplicateApplication)', () => {
    const { req, res, status, json } = mockReqRes();
    errorHandler(new ContractError(8, 'duplicate'), req, res, jest.fn());
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'CONTRACT_ERROR_8' }),
    }));
  });

  it('returns 400 for ContractError code 6 (GlobalApplicationLimitReached)', () => {
    const { req, res, status, json } = mockReqRes();
    errorHandler(new ContractError(6, 'limit reached'), req, res, jest.fn());
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'CONTRACT_ERROR_6' }),
    }));
  });

  it('returns 400 for ContractError code 7 (OrgAssignmentLimitReached)', () => {
    const { req, res, status } = mockReqRes();
    errorHandler(new ContractError(7, 'org limit'), req, res, jest.fn());
    expect(status).toHaveBeenCalledWith(400);
  });

  it('returns 404 for ContractError code 9 (ApplicationNotFound)', () => {
    const { req, res, status } = mockReqRes();
    errorHandler(new ContractError(9, 'not found'), req, res, jest.fn());
    expect(status).toHaveBeenCalledWith(404);
  });

  it('proxies HorizonError HTTP status', () => {
    const { req, res, status, json } = mockReqRes();
    errorHandler(new HorizonError(404, 'account not found'), req, res, jest.fn());
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'HORIZON_ERROR' }),
    }));
  });

  it('returns 502 for HorizonError with out-of-range status', () => {
    const { req, res, status } = mockReqRes();
    errorHandler(new HorizonError(0, 'network error'), req, res, jest.fn());
    expect(status).toHaveBeenCalledWith(502);
  });

  it('returns 500 for unexpected errors', () => {
    const { req, res, status, json } = mockReqRes();
    errorHandler(new Error('unexpected'), req, res, jest.fn());
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR' }),
    }));
  });

  it('does not include stack trace in production', () => {
    process.env.NODE_ENV = 'production';
    const { req, res, json } = mockReqRes();
    errorHandler(new Error('prod error'), req, res, jest.fn());
    const body = JSON.stringify((json as jest.Mock).mock.calls[0][0]);
    expect(body).not.toContain('at ');
  });
});
