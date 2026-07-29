import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { SorobanService } from '../soroban';
import { verifySignature, parseAuthHeader } from '../signature';
import { Address, nativeToScVal } from '@stellar/stellar-sdk';
import { logger } from '../logger';
import { validateBody } from '../middleware/validation';
import { registerMaintainerBodySchema, RegisterMaintainerBody } from '../schemas/admin';
import { registerOrgSchema, RegisterOrgInput } from '../schemas/orgs';

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
router.post(
  '/maintainers',
  signatureAuthMiddleware,
  validateBody(registerMaintainerBodySchema),
  async (req: Request, res: Response) => {
    const adminReq = req as Request & { adminAddress: string };
    const { maintainer_address, org_id, sequence } = req.body as RegisterMaintainerBody;

    try {
      // Build the register_maintainer transaction
      const account = adminReq.adminAddress;
      const args = [
        new Address(maintainer_address).toScVal(),
        nativeToScVal(org_id, { type: 'symbol' }),
      ];

      const tx = soroban.buildRawTransaction(
        account,
        sequence,
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
  },
);

// POST /api/admin/orgs
// Body: { org_id, maintainers: string[], cap: number }
// Registers a new organisation: records it in DB and registers each maintainer
// on the Soroban contract.
router.post(
  '/orgs',
  signatureAuthMiddleware,
  validateBody(registerOrgSchema),
  async (req: Request, res: Response) => {
    const adminReq = req as Request & { adminAddress: string };
    const { org_id, maintainers, cap } = req.body as RegisterOrgInput;

    try {
      // Persist the org registration
      await pool.query(
        `INSERT INTO orgs (org_id, cap, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (org_id) DO UPDATE SET cap = $2`,
        [org_id, cap],
      );

      // Register each maintainer in DB
      for (const addr of maintainers) {
        await pool.query(
          `INSERT INTO org_maintainers (org_id, maintainer_address, created_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (org_id, maintainer_address) DO NOTHING`,
          [org_id, addr],
        );
      }

      logger.info({
        correlationId: adminReq.correlationId,
        message: 'Org registered',
        org_id,
        maintainers,
        cap,
        registeredBy: adminReq.adminAddress,
      });

      res.status(201).json({
        org_id,
        maintainers,
        cap,
        message: 'Organisation registered successfully',
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
  },
);

export default router;
