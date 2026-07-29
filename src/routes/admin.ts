import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { SorobanService } from '../soroban';
import { GitHubService } from '../github';
import { verifySignature, parseAuthHeader } from '../signature';
import { Address, nativeToScVal } from '@stellar/stellar-sdk';
import { logger } from '../logger';
import { registerOrgSchema } from '../schemas/orgs';

const router = Router();
const soroban = new SorobanService();
const github = new GitHubService();

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

// POST /api/admin/orgs
// Body: { github_org: string, org_id: string, maintainers: string[], org_cap?: number }
// 1. Validates github_org exists via the GitHub API (422 if not found)
// 2. Checks for duplicate org_id (409 if already registered)
// 3. Inserts the org into the DB
// 4. Calls register_maintainer on the Soroban contract for each maintainer
// 5. Rolls back the DB insert if any contract call fails
router.post('/orgs', signatureAuthMiddleware, async (req: Request, res: Response) => {
  const adminReq = req as Request & { adminAddress: string };

  const parsed = registerOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    res.status(400).json({ error: 'validation_error', details: errors });
    return;
  }

  const { github_org, org_id, maintainers, org_cap } = parsed.data;

  // ── Step 1: Validate that the GitHub org exists ──────────────────────────
  let orgExists: boolean;
  try {
    orgExists = await github.validateOrg(github_org);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'GitHub API error';
    logger.error({
      correlationId: adminReq.correlationId,
      error: msg,
      stack: err instanceof Error ? err.stack : undefined,
    });
    res.status(502).json({ error: 'github_api_error', message: msg });
    return;
  }

  if (!orgExists) {
    res.status(422).json({
      error: 'invalid_github_org',
      message: `GitHub organisation '${github_org}' does not exist`,
    });
    return;
  }

  // ── Step 2: Check for duplicate org_id ──────────────────────────────────
  const existing = await pool.query(
    'SELECT org_id FROM orgs WHERE org_id = $1',
    [org_id],
  );
  if (existing.rows.length > 0) {
    res.status(409).json({
      error: 'conflict',
      message: `Organisation '${org_id}' is already registered`,
    });
    return;
  }

  // ── Step 3: Insert the org record ────────────────────────────────────────
  await pool.query(
    `INSERT INTO orgs (org_id, github_org, org_cap, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [org_id, github_org, org_cap],
  );

  // ── Step 4: Register each maintainer on the Soroban contract ─────────────
  // If any call fails we delete the newly-inserted org row (rollback).
  const registered: string[] = [];
  for (const maintainer of maintainers) {
    try {
      await soroban.registerMaintainer(adminReq.adminAddress, maintainer, org_id);
      registered.push(maintainer);
    } catch (err) {
      // ── Step 5: Rollback — remove the org row we just inserted ───────────
      try {
        await pool.query('DELETE FROM orgs WHERE org_id = $1', [org_id]);
      } catch (rollbackErr) {
        logger.error({
          correlationId: adminReq.correlationId,
          message: 'Rollback failed',
          error: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
        });
      }

      const msg = err instanceof Error ? err.message : 'contract error';
      logger.error({
        correlationId: adminReq.correlationId,
        message: 'register_maintainer contract call failed — DB rolled back',
        maintainer,
        org_id,
        error: msg,
      });
      res.status(502).json({
        error: 'contract_error',
        message: `Failed to register maintainer ${maintainer}: ${msg}`,
        registered,
      });
      return;
    }
  }

  logger.info({
    correlationId: adminReq.correlationId,
    message: 'Org registered',
    org_id,
    github_org,
    maintainers,
    org_cap,
    registeredBy: adminReq.adminAddress,
  });

  res.status(201).json({
    org_id,
    github_org,
    maintainers,
    org_cap,
    message: 'Organisation registered successfully',
  });
});

export default router;
