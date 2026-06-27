import { Router, Request, Response } from 'express';
import { Address } from '@stellar/stellar-sdk';
import { SorobanService } from '../soroban';
import { Transaction } from '@stellar/stellar-sdk';

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

export default router;
