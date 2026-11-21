/**
 * Audit middleware — auto-logs all state-changing operations (POST, PUT, DELETE).
 *
 * Captures: timestamp, actor (API key header or IP), org_id (from body or query),
 * operation (method + path), request_id (from correlation middleware), and outcome
 * (success/error).  Writes to the audit table via AuditService.
 */
import { Request, Response, NextFunction } from 'express';
import { db } from '../config/database';
import { logger } from '../logger';

export interface AuditEntry {
  timestamp: Date;
  actor: string;
  org_id: string | null;
  operation: string;
  request_id: string | null;
  outcome: 'success' | 'error';
  method: string;
  path: string;
  status_code: number;
}

/**
 * Express middleware that intercepts the `res.end()` call to capture the
 * final status code after the route handler finishes, then writes an
 * audit log entry for all state-changing methods (POST, PUT, PATCH, DELETE).
 */
export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();

  // Only audit state-changing operations
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return next();
  }

  // Capture the original end to intercept the response
  const originalEnd = res.end.bind(res);

  res.end = function (...args: Parameters<typeof originalEnd>): ReturnType<typeof originalEnd> {
    // Restore immediately to avoid double-wrapping
    res.end = originalEnd;

    const statusCode = res.statusCode;
    const outcome = statusCode >= 200 && statusCode < 400 ? 'success' : 'error';

    // Extract actor from API key header or fall back to IP
    const actor =
      (req.headers['x-api-key'] as string) ||
      (req.headers['x-maintainer-key'] as string) ||
      req.ip ||
      'unknown';

    // Extract org_id from body or query
    const orgId =
      (req.body as Record<string, unknown>)?.org_id as string | undefined ||
      (req.query as Record<string, unknown>)?.org_id as string | undefined ||
      null;

    const requestId =
      ((req as Record<string, unknown>).correlationId as string) || null;

    const operation = `${method} ${req.path}`;

    const entry: AuditEntry = {
      timestamp: new Date(),
      actor,
      org_id: orgId,
      operation,
      request_id: requestId,
      outcome,
      method,
      path: req.path,
      status_code: statusCode,
    };

    // Write to database (fire-and-forget, don't block the response)
    db('audit_log')
      .insert({
        timestamp: entry.timestamp,
        actor: entry.actor,
        org_id: entry.org_id,
        operation: entry.operation,
        request_id: entry.request_id,
        outcome: entry.outcome,
        method: entry.method,
        path: entry.path,
        status_code: entry.status_code,
      })
      .catch((err: Error) => {
        logger.error({ message: 'Failed to write audit log', error: err.message });
      });

    // Also log for operational visibility
    logger.info({
      message: 'audit',
      ...entry,
    });

    return originalEnd(...args);
  } as typeof res.end;

  next();
}
