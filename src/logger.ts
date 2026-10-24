import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';

const requestContext = new AsyncLocalStorage<{ requestId: string }>();

const logger = pino({
  mixin() {
    const context = requestContext.getStore();
    return context ? { requestId: context.requestId } : {};
  },
  transport: {
    target: 'pino/file',
  },
});

export { logger };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incomingRequestId = req.get('X-Request-ID');
  const requestId = incomingRequestId && /^[\x21-\x7e]{1,128}$/.test(incomingRequestId)
    ? incomingRequestId
    : uuidv4();

  req.correlationId = requestId;
  res.setHeader('X-Request-ID', requestId);

  const startTime = Date.now();

  requestContext.run({ requestId }, () => {
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      logger.info({
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration,
        timestamp: new Date().toISOString(),
      });
    });

    next();
  });
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
): void {
  const correlationId = _req.correlationId ?? 'unknown';
  logger.error({
    correlationId,
    error: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  });

  res.status(500).json({
    error: 'internal server error',
    correlationId,
  });
}
