/**
 * logger.ts — Structured JSON logging with per-request correlation IDs
 *
 * Features:
 *  - Structured JSON log output via pino
 *  - Log level configurable via LOG_LEVEL env var (default: 'info' in prod, 'debug' in dev)
 *  - Correlation ID assigned per-request from X-Correlation-Id header or generated UUID
 *  - X-Correlation-Id propagated in response headers
 *  - Log format: { timestamp, level, correlation_id, method, path, status, duration_ms, message }
 *  - Sensitive fields (authorization, api_key, password, secret, privateKey) are redacted
 */

import pino, { Logger, DestinationStream } from 'pino';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response, NextFunction } from 'express';

const isDev = process.env['NODE_ENV'] !== 'production';

// ---------------------------------------------------------------------------
// Build log destination — use pino-pretty in dev if available; stdout otherwise
// ---------------------------------------------------------------------------

function buildDestination(): DestinationStream {
  if (isDev) {
    try {
      require.resolve('pino-pretty');
      return pino.transport({ target: 'pino-pretty', options: { colorize: true } });
    } catch {
      // pino-pretty not installed; fall through to plain stdout
    }
  }
  return pino.destination(1);
}

// ---------------------------------------------------------------------------
// Logger instance
// ---------------------------------------------------------------------------

/**
 * Shared pino logger.  Log level is controlled by the LOG_LEVEL env var.
 * Sensitive fields are redacted so they never appear in log output.
 */
export const logger: Logger = pino(
  {
    level: process.env['LOG_LEVEL'] ?? (isDev ? 'debug' : 'info'),
    base: { service: 'workload-governor' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'authorization',
        'headers.authorization',
        'req.headers.authorization',
        'password',
        '*.password',
        'secret',
        '*.secret',
        'apiKey',
        '*.apiKey',
        'api_key',
        '*.api_key',
        'privateKey',
        '*.privateKey',
        'private_key',
        '*.private_key',
      ],
      censor: '[REDACTED]',
    },
  },
  buildDestination(),
);

// ---------------------------------------------------------------------------
// Express type augmentation
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** UUID correlation ID assigned by correlationIdMiddleware */
      correlationId: string;
    }
  }
}

// ---------------------------------------------------------------------------
// Middleware: assign/propagate correlation ID
// ---------------------------------------------------------------------------

/**
 * Express middleware that:
 *  1. Reads X-Correlation-Id from the incoming request header; if present,
 *     uses it as-is so the client-supplied trace ID is honoured.
 *  2. Falls back to a freshly generated UUID v4 when no header is present.
 *  3. Attaches the ID to req.correlationId for use in downstream handlers.
 *  4. Sets X-Correlation-Id on the response so callers can correlate logs.
 *  5. Emits a structured access-log entry on response finish.
 */
export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Honour client-supplied ID or generate a fresh one
  const incoming = req.headers['x-correlation-id'];
  req.correlationId =
    typeof incoming === 'string' && incoming.length > 0 ? incoming : uuidv4();

  // Propagate correlation ID back to the caller
  res.setHeader('X-Correlation-Id', req.correlationId);

  const startTime = Date.now();

  res.on('finish', () => {
    const duration_ms = Date.now() - startTime;
    logger.info({
      correlation_id: req.correlationId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms,
      message: 'request completed',
    });
  });

  next();
}

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

/**
 * Express error handler that logs with correlation ID and returns a
 * structured 500 JSON response.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const correlationId = _req.correlationId ?? 'unknown';
  logger.error({
    correlation_id: correlationId,
    error: err.message,
    stack: err.stack,
    message: 'unhandled error',
  });

  res.status(500).json({
    error: 'internal server error',
    correlation_id: correlationId,
  });
}
