import { Router, Request, Response } from 'express';
import { SorobanService } from '../soroban';
import { Transaction } from '@stellar/stellar-sdk';
import { verifyTransactionXdr } from '../xdrVerifier';
import { logger } from '../logger';
import { validateBody } from '../middleware/validation';
import { pool } from '../db';
import { applyIssueSchema, ApplyIssueInput } from '../schemas/issues';
import {
  withdrawSchema,
  assignSchema,
  completeSchema,
  revokeSchema,
  submitSchema,
  WithdrawInput,
  AssignInput,
  CompleteInput,
  RevokeInput,
  SubmitInput,
} from '../schemas/transactions';

const router = Router();
const soroban = new SorobanService();

interface TransactionResponse {
  xdr: string;
  fee: string;
  instructions?: number;
  readBytes?: number;
  writeBytes?: number;
  network_passphrase?: string;
}

async function buildAndSimulate(
  res: Response,
  buildFn: () => Transaction,
): Promise<void> {
  try {
    const tx = buildFn();
    const estimate = await soroban.simulate(tx);
    const response: TransactionResponse = {
      xdr: tx.toXDR(),
      fee: estimate.fee,
      instructions: estimate.instructions,
      readBytes: estimate.readBytes,
      writeBytes: estimate.writeBytes,
    };
    res.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'transaction simulation failed';
    res.status(400).json({ error: msg });
  }
}

router.post('/apply', validateBody(applyIssueSchema), async (req: Request, res: Response) => {
  try {
    const { contributor, org_id, issue_id, sequence } = req.body as ApplyIssueInput;
    const issueIdNum = parseInt(String(issue_id), 10);

    // 1. Check if contributor already applied
    if (pool && typeof pool.query === 'function') {
      const appCheck = await pool.query(
        'SELECT id FROM applications WHERE contributor = $1 AND org_id = $2 AND issue_id = $3 LIMIT 1',
        [contributor, org_id, issueIdNum],
      );
      if (appCheck.rows && appCheck.rows.length > 0) {
        return res.status(409).json({ error: 'Contributor has already applied for this issue' });
      }
    }

    try {
      const alreadyAppliedOnChain = await soroban.hasApplied(contributor, org_id, issueIdNum);
      if (alreadyAppliedOnChain) {
        return res.status(409).json({ error: 'Contributor has already applied for this issue' });
      }
    } catch {
      // Ignore simulation/soroban lookup error during fallback check
    }

    // 2. Check Global / Org caps
    if (pool && typeof pool.query === 'function') {
      // Global cap check
      const globalAppsRes = await pool.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM applications WHERE contributor = $1 AND status = $2',
        [contributor, 'pending'],
      );
      const globalAppsCount = parseInt(globalAppsRes.rows[0]?.count ?? '0', 10);
      const GLOBAL_CAP = 15;
      if (globalAppsCount >= GLOBAL_CAP) {
        return res.status(429).json({
          error: 'Global application cap reached',
          details: { cap_type: 'global', limit: GLOBAL_CAP, current: globalAppsCount },
        });
      }

      // Org cap check
      const orgCapRes = await pool.query<{ org_cap: number }>(
        'SELECT org_cap FROM orgs WHERE org_id = $1 LIMIT 1',
        [org_id],
      );
      const orgCap = orgCapRes.rows[0]?.org_cap ?? 4;
      const orgAppsRes = await pool.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM applications WHERE contributor = $1 AND org_id = $2 AND status = $3',
        [contributor, org_id, 'pending'],
      );
      const orgAppsCount = parseInt(orgAppsRes.rows[0]?.count ?? '0', 10);
      if (orgAppsCount >= orgCap) {
        return res.status(429).json({
          error: 'Org application cap reached',
          details: { cap_type: 'org', limit: orgCap, current: orgAppsCount },
        });
      }
    }

    // 3. Fetch sequence number if not explicitly supplied
    let seq = sequence;
    if (!seq) {
      seq = await soroban.getAccountSequence(contributor);
    }

    // 4. Build unsigned XDR transaction
    const tx = soroban.buildApplyTx(contributor, org_id, issueIdNum, seq);
    let fee = '100';
    try {
      const estimate = await soroban.simulate(tx);
      fee = estimate.fee || '100';
    } catch {
      // Use default base fee if simulation fails
    }

    const network_passphrase =
      process.env.STELLAR_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015';

    return res.json({
      xdr: tx.toXDR(),
      fee,
      network_passphrase,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to build apply transaction';
    return res.status(500).json({ error: msg });
  }
});

router.post('/withdraw', validateBody(withdrawSchema), (req: Request, res: Response) => {
  const { contributor, org_id, issue_id, sequence } = req.body as WithdrawInput;
  buildAndSimulate(res, () =>
    soroban.buildWithdrawTx(contributor, org_id, Number(issue_id), sequence),
  );
});

router.post('/assign', validateBody(assignSchema), (req: Request, res: Response) => {
  const { maintainer, contributor, org_id, issue_id, sequence } = req.body as AssignInput;
  buildAndSimulate(res, () =>
    soroban.buildAssignTx(maintainer, contributor, org_id, Number(issue_id), sequence),
  );
});

router.post('/complete', validateBody(completeSchema), (req: Request, res: Response) => {
  const { maintainer, contributor, org_id, issue_id, sequence } = req.body as CompleteInput;
  buildAndSimulate(res, () =>
    soroban.buildCompleteTx(maintainer, contributor, org_id, Number(issue_id), sequence),
  );
});

router.post('/revoke', validateBody(revokeSchema), (req: Request, res: Response) => {
  const { maintainer, contributor, org_id, issue_id, sequence } = req.body as RevokeInput;
  buildAndSimulate(res, () =>
    soroban.buildRevokeTx(maintainer, contributor, org_id, Number(issue_id), sequence),
  );
});

// ---------------------------------------------------------------------------
// POST /submit — verify signed XDR then broadcast to Stellar network
// Issue #314: server-side signature verification
// ---------------------------------------------------------------------------

/**
 * Submit a pre-signed Stellar XDR transaction.
 *
 * Verifies before broadcasting:
 *   1. Transaction is signed by the contributor address in the operation args
 *   2. Transaction has not expired (timeBounds)
 *   3. Contract ID matches configured CONTRACT_ID
 *
 * Returns 403 with a `reason` field if any check fails.
 * All failed verifications are logged with the requester IP and reason.
 */
router.post('/submit', validateBody(submitSchema), async (req: Request, res: Response) => {
  const { signed_xdr } = req.body as SubmitInput;

  const ip = req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown';

  // --- Verify the signed XDR ---
  const verification = verifyTransactionXdr(signed_xdr);

  if (!verification.ok) {
    // Log every failed verification with IP and reason (closes #314 logging req)
    logger.warn({
      event: 'signature_verification_failed',
      reason: verification.reason,
      detail: verification.detail,
      ip,
      timestamp: new Date().toISOString(),
    });

    res.status(403).json({
      error: 'transaction verification failed',
      reason: verification.reason,
      detail: verification.detail,
    });
    return;
  }

  // --- Broadcast to network ---
  try {
    const { Transaction: StellarTx, xdr } = await import('@stellar/stellar-sdk');
    const envelope = xdr.TransactionEnvelope.fromXDR(signed_xdr, 'base64');
    const tx = new StellarTx(
      envelope,
      process.env.STELLAR_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015',
    );

    const result = await soroban.submitTransaction(tx);

    if (result.status === 'error') {
      res.status(400).json({
        error: 'transaction submission failed',
        detail: result.error?.message ?? 'unknown error',
      });
      return;
    }

    logger.info({
      event: 'transaction_submitted',
      hash: result.hash,
      signer: verification.signerAddress,
      contract: verification.contractId,
      ip,
      timestamp: new Date().toISOString(),
    });

    res.json({
      hash: result.hash,
      status: result.status,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'submission error';
    res.status(500).json({ error: msg });
  }
});

export default router;
