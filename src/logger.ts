import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response, NextFunction } from 'express';

const logger = pino({
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
  req.correlationId = uuidv4();

  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info({
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      timestamp: new Date().toISOString(),
    });
  });

  next();
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
