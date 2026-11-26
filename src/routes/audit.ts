/**
 * audit.ts — Express router for audit-log endpoints.
 *
 * Routes:
 *   GET /api/v1/audit/verify
 *     Re-derives every entry hash and HMAC signature for the entire
 *     audit_log table and returns a summary of any integrity failures.
 *
 * Authentication: requires a valid X-Admin-Token header so that chain
 * details are not exposed to unauthenticated callers.
 */

import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { AuditService } from '../services/auditService';

const router = Router();

function adminAuth(req: Request, res: Response, next: () => void): void {
  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_TOKEN) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

/**
 * GET /api/v1/audit/verify
 *
 * Response (200 — always returned, even when integrity fails):
 * {
 *   ok:     boolean,          // true iff every entry passed both checks
 *   total:  number,           // entries inspected
 *   broken: Array<{           // empty when ok === true
 *     id:     number,
 *     reason: string
 *   }>
 * }
 *
 * Response (503 — when the verification query itself throws):
 * { error: string }
 */
router.get('/verify', adminAuth, async (_req: Request, res: Response) => {
  try {
    const service = new AuditService(pool);
    const result = await service.verify();

    // Use 200 for both "clean" and "tampered" outcomes so the caller can
    // programmatically inspect `ok` without special-casing HTTP status codes.
    // A 503 is reserved for unexpected server-side errors (DB down, etc.).
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    res.status(503).json({ error: message });
  }
});

export default router;
