import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response, NextFunction } from 'express';

const logger = pino({
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
