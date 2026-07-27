import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { SorobanService } from '../soroban';
import { verifySignature, parseAuthHeader } from '../signature';
import { Address, nativeToScVal } from '@stellar/stellar-sdk';
import { logger } from '../logger';

const router = Router();
const soroban = new SorobanService();

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

export default router;
