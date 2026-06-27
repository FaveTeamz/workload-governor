import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  error: ApiError;
  correlationId?: string;
}

/** Contract / Soroban error codes surfaced from RPC responses */
export class ContractError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'ContractError';
  }
}

/** Horizon API errors */
export class HorizonError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HorizonError';
  }
}

/** Validation errors (manual field validation) */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

function contractCodeToHttpStatus(code: number): number {
  if (code === 3 || code === 4 || code === 5) return 403;
  if (code === 8 || code === 11) return 409;
  if (code === 9 || code === 10) return 404;
  return 400;
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const correlationId = req.correlationId ?? 'unknown';
  const isProd = process.env.NODE_ENV === 'production';

  if (err instanceof ValidationError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: err.message, details: err.details },
      correlationId,
    } satisfies ApiErrorResponse);
    return;
  }

  if (err instanceof ContractError) {
    res.status(contractCodeToHttpStatus(err.code)).json({
      error: {
        code: `CONTRACT_ERROR_${err.code}`,
        message: err.message,
        details: { contractCode: err.code },
      },
      correlationId,
    } satisfies ApiErrorResponse);
    return;
  }

  if (err instanceof HorizonError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    res.status(status).json({
      error: { code: 'HORIZON_ERROR', message: err.message },
      correlationId,
    } satisfies ApiErrorResponse);
    return;
  }

  logger.error({
    correlationId,
    error: err.message,
    stack: isProd ? undefined : err.stack,
  });

  res.status(500).json({
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' },
    correlationId,
  } satisfies ApiErrorResponse);
}
