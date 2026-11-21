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
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'body.secret'],
    censor: '[REDACTED]',
  },
  },
  transport: {
    target: 'pino/file',
  },
});

export { logger };

// =============================================================================
// Structured audit logging (#1323)
// =============================================================================
//
// All audit events are emitted as structured JSON with the top-level field
// `audit: true` so they can be isolated in CloudWatch Logs Insights with:
//
//   fields @timestamp, action, actor.id, target.id, outcome
//   | filter audit = true
//   | sort @timestamp desc
//
// Every call to logAuditEvent is synchronous (pino serialises asynchronously);
// there is zero blocking overhead on the request path.
// =============================================================================

/** The full shape of a structured audit event. */
export interface AuditEvent {
  /** Machine-readable name for the operation, e.g. "register_maintainer". */
  action: string;
  /** Who performed the action. */
  actor: {
    type: 'admin' | 'maintainer' | 'contributor';
    /** Stellar public key or GitHub login. */
    id: string;
    /** Originating IP address when available. */
    ip?: string;
  };
  /** The resource the action was applied to. */
  target: {
    type: 'org' | 'issue' | 'contract';
    id: string;
  };
  /** Whether the action completed successfully. */
  outcome: 'success' | 'failure';
  /** Optional free-form payload for SIEM indexing (error codes, tx hashes, etc.). */
  details?: Record<string, unknown>;
}

/**
 * Emit a structured audit log entry.
 *
 * The emitted JSON always contains:
 *   audit, action, actor, target, outcome, details (when provided)
 *
 * Example CloudWatch Logs Insights filter:
 *   { $.audit = true && $.outcome = "failure" }
 */
export function logAuditEvent(event: AuditEvent): void {
  logger.info(
    { audit: true, ...event },
    `AUDIT: ${event.action} by ${event.actor.id}`,
  );
}

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
