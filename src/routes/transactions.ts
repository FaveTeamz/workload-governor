import { Router, Request, Response } from 'express';
import { Address } from '@stellar/stellar-sdk';
import { SorobanService, SUPPORTED_FUNCTIONS } from '../soroban';
import type { SupportedFunction, FeeEstimate } from '../soroban';
import { Transaction } from '@stellar/stellar-sdk';
import { verifyTransactionXdr } from '../xdrVerifier';
import { logger } from '../logger';
import { getCached, setCached } from '../cache';

const router = Router();
const soroban = new SorobanService();

interface TransactionResponse {
  xdr: string;
  fee: string;
  instructions: number;
  readBytes: number;
  writeBytes: number;
}

interface ValidationError {
  field: string;
  message: string;
}

function isValidStellarAddress(address: unknown): boolean {
  if (typeof address !== 'string') return false;
  try {
    new Address(address);
    return true;
  } catch {
    return false;
  }
}

function isValidOrgId(orgId: unknown): boolean {
  if (typeof orgId !== 'string') return false;
  return orgId.length > 0 && orgId.length <= 256;
}

function isValidIssueId(issueId: unknown): boolean {
  const num = Number(issueId);
  return Number.isInteger(num) && num > 0;
}

function isValidSequence(sequence: unknown): boolean {
  if (typeof sequence !== 'string') return false;
  const num = BigInt(sequence);
  return num >= 0n;
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

// ---------------------------------------------------------------------------
// GET /estimate-fee — return current fee estimate for a given contract function
// ---------------------------------------------------------------------------

/**
 * Return a fee breakdown for the requested Soroban contract function.
 *
 * Query params:
 *   function  — one of apply_for_issue | withdraw_application | assign_issue |
 *               complete_assignment | revoke_assignment
 *
 * Response (200):
 *   { base_fee_xlm, resource_fee_xlm, total_fee_xlm, fee_cushion_pct }
 *
 * The resource_fee_xlm already includes a 20% cushion.
 * Results are cached per function name for 10 seconds.
 *
 * Response (400): unknown or missing function name.
 */
router.get('/estimate-fee', async (req: Request, res: Response) => {
  const fnName = req.query['function'];

  if (typeof fnName !== 'string' || !(SUPPORTED_FUNCTIONS as readonly string[]).includes(fnName)) {
    res.status(400).json({
      error: 'invalid function name',
      supported: SUPPORTED_FUNCTIONS,
    });
    return;
  }

  const cacheKey = `fee_estimate:${fnName}`;
  const CACHE_TTL_SECONDS = 10;

  try {
    const cached = await getCached<FeeEstimate>(cacheKey);
    if (cached !== null) {
      res.json(cached);
      return;
    }

    const estimate = await soroban.estimateFee(fnName as SupportedFunction);
    await setCached(cacheKey, estimate, CACHE_TTL_SECONDS);
    res.json(estimate);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fee estimation failed';
    res.status(500).json({ error: msg });
  }
});

router.post('/apply', (req: Request, res: Response) => {
  const { contributor, org_id, issue_id, sequence } = req.body as Record<string, unknown>;
  const errors: ValidationError[] = [];

  if (!isValidStellarAddress(contributor)) {
    errors.push({ field: 'contributor', message: 'invalid stellar address' });
  }
  if (!isValidOrgId(org_id)) {
    errors.push({ field: 'org_id', message: 'org_id must be a non-empty string' });
  }
  if (!isValidIssueId(issue_id)) {
    errors.push({ field: 'issue_id', message: 'issue_id must be a positive integer' });
  }
  if (!isValidSequence(sequence)) {
    errors.push({ field: 'sequence', message: 'sequence must be a valid number string' });
  }

  if (errors.length > 0) {
    res.status(400).json({ error: 'validation failed', details: errors });
    return;
  }

  buildAndSimulate(res, () =>
    soroban.buildApplyTx(
      contributor as string, org_id as string,
      Number(issue_id), sequence as string,
    ),
  );
});

router.post('/withdraw', (req: Request, res: Response) => {
  const { contributor, org_id, issue_id, sequence } = req.body as Record<string, unknown>;
  const errors: ValidationError[] = [];

  if (!isValidStellarAddress(contributor)) {
    errors.push({ field: 'contributor', message: 'invalid stellar address' });
  }
  if (!isValidOrgId(org_id)) {
    errors.push({ field: 'org_id', message: 'org_id must be a non-empty string' });
  }
  if (!isValidIssueId(issue_id)) {
    errors.push({ field: 'issue_id', message: 'issue_id must be a positive integer' });
  }
  if (!isValidSequence(sequence)) {
    errors.push({ field: 'sequence', message: 'sequence must be a valid number string' });
  }

  if (errors.length > 0) {
    res.status(400).json({ error: 'validation failed', details: errors });
    return;
  }

  buildAndSimulate(res, () =>
    soroban.buildWithdrawTx(
      contributor as string, org_id as string,
      Number(issue_id), sequence as string,
    ),
  );
});

router.post('/assign', (req: Request, res: Response) => {
  const { maintainer, contributor, org_id, issue_id, sequence } = req.body as Record<string, unknown>;
  const errors: ValidationError[] = [];

  if (!isValidStellarAddress(maintainer)) {
    errors.push({ field: 'maintainer', message: 'invalid stellar address' });
  }
  if (!isValidStellarAddress(contributor)) {
    errors.push({ field: 'contributor', message: 'invalid stellar address' });
  }
  if (!isValidOrgId(org_id)) {
    errors.push({ field: 'org_id', message: 'org_id must be a non-empty string' });
  }
  if (!isValidIssueId(issue_id)) {
    errors.push({ field: 'issue_id', message: 'issue_id must be a positive integer' });
  }
  if (!isValidSequence(sequence)) {
    errors.push({ field: 'sequence', message: 'sequence must be a valid number string' });
  }

  if (errors.length > 0) {
    res.status(400).json({ error: 'validation failed', details: errors });
    return;
  }

  buildAndSimulate(res, () =>
    soroban.buildAssignTx(
      maintainer as string, contributor as string,
      org_id as string, Number(issue_id), sequence as string,
    ),
  );
});

router.post('/complete', (req: Request, res: Response) => {
  const { maintainer, contributor, org_id, issue_id, sequence } = req.body as Record<string, unknown>;
  const errors: ValidationError[] = [];

  if (!isValidStellarAddress(maintainer)) {
    errors.push({ field: 'maintainer', message: 'invalid stellar address' });
  }
  if (!isValidStellarAddress(contributor)) {
    errors.push({ field: 'contributor', message: 'invalid stellar address' });
  }
  if (!isValidOrgId(org_id)) {
    errors.push({ field: 'org_id', message: 'org_id must be a non-empty string' });
  }
  if (!isValidIssueId(issue_id)) {
    errors.push({ field: 'issue_id', message: 'issue_id must be a positive integer' });
  }
  if (!isValidSequence(sequence)) {
    errors.push({ field: 'sequence', message: 'sequence must be a valid number string' });
  }

  if (errors.length > 0) {
    res.status(400).json({ error: 'validation failed', details: errors });
    return;
  }

  buildAndSimulate(res, () =>
    soroban.buildCompleteTx(
      maintainer as string, contributor as string,
      org_id as string, Number(issue_id), sequence as string,
    ),
  );
});

router.post('/revoke', (req: Request, res: Response) => {
  const { maintainer, contributor, org_id, issue_id, sequence } = req.body as Record<string, unknown>;
  const errors: ValidationError[] = [];

  if (!isValidStellarAddress(maintainer)) {
    errors.push({ field: 'maintainer', message: 'invalid stellar address' });
  }
  if (!isValidStellarAddress(contributor)) {
    errors.push({ field: 'contributor', message: 'invalid stellar address' });
  }
  if (!isValidOrgId(org_id)) {
    errors.push({ field: 'org_id', message: 'org_id must be a non-empty string' });
  }
  if (!isValidIssueId(issue_id)) {
    errors.push({ field: 'issue_id', message: 'issue_id must be a positive integer' });
  }
  if (!isValidSequence(sequence)) {
    errors.push({ field: 'sequence', message: 'sequence must be a valid number string' });
  }

  if (errors.length > 0) {
    res.status(400).json({ error: 'validation failed', details: errors });
    return;
  }

  buildAndSimulate(res, () =>
    soroban.buildRevokeTx(
      maintainer as string, contributor as string,
      org_id as string, Number(issue_id), sequence as string,
    ),
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
router.post('/submit', async (req: Request, res: Response) => {
  const { signed_xdr } = req.body as Record<string, unknown>;

  if (!signed_xdr || typeof signed_xdr !== 'string') {
    res.status(400).json({ error: 'signed_xdr is required and must be a string' });
    return;
  }

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
