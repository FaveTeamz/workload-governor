import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { SorobanService } from '../soroban';
import { verifySignature, parseAuthHeader } from '../signature';
import { Address, nativeToScVal } from '@stellar/stellar-sdk';
import { logger } from '../logger';
import { adminCapUpdateSchema } from '../schemas/admin';
import { recordAuditEvent } from '../services/auditService';

const router = Router();
const soroban = new SorobanService();

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  return typeof fwd === 'string' ? fwd.split(',')[0].trim() : (req.socket.remoteAddress ?? 'unknown');
}

async function signatureAuthMiddleware(
  req: Request,
  res: Response,
  next: () => void,
): Promise<void> {
  const authHeader = req.headers.authorization;
  const signed = parseAuthHeader(authHeader);

  if (!signed) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  if (!verifySignature(signed.adminAddress, signed.message, signed.signature)) {
    logger.warn({
      correlationId: req.correlationId,
      message: 'Invalid admin signature',
      adminAddress: signed.adminAddress,
    });
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  (req as Request & { adminAddress: string }).adminAddress = signed.adminAddress;
  next();
}

// POST /api/admin/maintainers
// Body: { maintainer_address, org_id, sequence }
// Returns unsigned transaction XDR for admin to sign
router.post('/maintainers', signatureAuthMiddleware, async (req: Request, res: Response) => {
  const adminReq = req as Request & { adminAddress: string };
  const { maintainer_address, org_id, sequence } = req.body as Record<string, unknown>;

  if (!maintainer_address || !org_id || !sequence) {
    res.status(400).json({
      error: 'maintainer_address, org_id, and sequence required',
    });
    return;
  }

  try {
    // Build the register_maintainer transaction
    const account = adminReq.adminAddress;
    const args = [
      new Address(maintainer_address as string).toScVal(),
      nativeToScVal(org_id, { type: 'symbol' }),
    ];

    const tx = soroban.buildRawTransaction(
      account,
      sequence as string,
      'register_maintainer',
      args,
    );

    // Store pending transaction for later verification
    await pool.query(
      `INSERT INTO pending_transactions (admin_address, org_id, maintainer_address, transaction_xdr, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (admin_address, maintainer_address, org_id) DO UPDATE
       SET transaction_xdr = $4, created_at = NOW()`,
      [account, org_id, maintainer_address, tx.toXDR()],
    );

    res.status(200).json({
      xdr: tx.toXDR(),
      message: 'Sign this transaction with your admin key and submit to /broadcast',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal error';
    logger.error({
      correlationId: adminReq.correlationId,
      error: msg,
      stack: err instanceof Error ? err.stack : undefined,
    });
    res.status(400).json({ error: msg });
  }
});

/**
 * POST /api/admin/caps
 *
 * Update the global and per-org workload caps.
 * Requires admin signature authentication.
 * Validates input with Zod and records an immutable audit log entry
 * including before/after values and the requesting admin's public key + IP.
 */
router.post('/caps', signatureAuthMiddleware, async (req: Request, res: Response) => {
  const adminReq = req as Request & { adminAddress: string };
  const ip = getClientIp(req);

  // --- Zod validation ---
  const parseResult = adminCapUpdateSchema.safeParse(req.body);
  if (!parseResult.success) {
    const fieldErrors = parseResult.error.issues.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    res.status(400).json({ error: 'Validation failed', fields: fieldErrors });
    return;
  }

  const { global_cap, per_org_cap } = parseResult.data;

  try {
    // Fetch current cap values for before/after audit record
    const currentResult = await pool.query<{ global_cap: number; per_org_cap: number }>(
      `SELECT global_cap, per_org_cap FROM governance_caps ORDER BY updated_at DESC LIMIT 1`,
    );
    const previous = currentResult.rows[0] ?? null;

    // Upsert the new cap values
    await pool.query(
      `INSERT INTO governance_caps (global_cap, per_org_cap, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())`,
      [global_cap, per_org_cap, adminReq.adminAddress],
    );

    // Record immutable audit log entry (fire-and-forget, never blocks response)
    void recordAuditEvent({
      event_type: 'cap_update',
      actor: adminReq.adminAddress,
      ip_address: ip,
      resource: 'governance_caps',
      previous_value: previous ?? undefined,
      new_value: { global_cap, per_org_cap },
      metadata: { correlationId: req.correlationId },
    });

    logger.info({
      correlationId: req.correlationId,
      message: 'Governance caps updated',
      admin: adminReq.adminAddress,
      previous,
      new: { global_cap, per_org_cap },
    });

    res.status(200).json({
      message: 'Caps updated successfully',
      global_cap,
      per_org_cap,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal error';
    logger.error({
      correlationId: adminReq.correlationId,
      error: msg,
      stack: err instanceof Error ? err.stack : undefined,
    });
    res.status(500).json({ error: msg });
  }
});

export default router;
