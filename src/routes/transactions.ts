import { Router, Request, Response } from 'express';
import { SorobanService } from '../soroban';
import { Transaction } from '@stellar/stellar-sdk';

const router = Router();
const soroban = new SorobanService();

async function buildAndSimulate(
  res: Response,
  buildFn: () => Transaction,
): Promise<void> {
  try {
    const tx = buildFn();
    const estimate = await soroban.simulate(tx);
    res.json({ xdr: tx.toXDR(), ...estimate });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal error';
    res.status(400).json({ error: msg });
  }
}

// POST /api/transactions/apply
router.post('/apply', (req: Request, res: Response) => {
  const { contributor, org_id, issue_id, sequence } = req.body as Record<string, unknown>;
  if (!contributor || !org_id || issue_id == null || !sequence) {
    res.status(400).json({ error: 'contributor, org_id, issue_id, sequence required' });
    return;
  }
  buildAndSimulate(res, () =>
    soroban.buildApplyTx(
      contributor as string, org_id as string,
      Number(issue_id), sequence as string,
    ),
  );
});

// POST /api/transactions/withdraw
router.post('/withdraw', (req: Request, res: Response) => {
  const { contributor, org_id, issue_id, sequence } = req.body as Record<string, unknown>;
  if (!contributor || !org_id || issue_id == null || !sequence) {
    res.status(400).json({ error: 'contributor, org_id, issue_id, sequence required' });
    return;
  }
  buildAndSimulate(res, () =>
    soroban.buildWithdrawTx(
      contributor as string, org_id as string,
      Number(issue_id), sequence as string,
    ),
  );
});

// POST /api/transactions/assign
router.post('/assign', (req: Request, res: Response) => {
  const { maintainer, contributor, org_id, issue_id, sequence } = req.body as Record<string, unknown>;
  if (!maintainer || !contributor || !org_id || issue_id == null || !sequence) {
    res.status(400).json({ error: 'maintainer, contributor, org_id, issue_id, sequence required' });
    return;
  }
  buildAndSimulate(res, () =>
    soroban.buildAssignTx(
      maintainer as string, contributor as string,
      org_id as string, Number(issue_id), sequence as string,
    ),
  );
});

// POST /api/transactions/complete
router.post('/complete', (req: Request, res: Response) => {
  const { maintainer, contributor, org_id, issue_id, sequence } = req.body as Record<string, unknown>;
  if (!maintainer || !contributor || !org_id || issue_id == null || !sequence) {
    res.status(400).json({ error: 'maintainer, contributor, org_id, issue_id, sequence required' });
    return;
  }
  buildAndSimulate(res, () =>
    soroban.buildCompleteTx(
      maintainer as string, contributor as string,
      org_id as string, Number(issue_id), sequence as string,
    ),
  );
});

// POST /api/transactions/revoke
router.post('/revoke', (req: Request, res: Response) => {
  const { maintainer, contributor, org_id, issue_id, sequence } = req.body as Record<string, unknown>;
  if (!maintainer || !contributor || !org_id || issue_id == null || !sequence) {
    res.status(400).json({ error: 'maintainer, contributor, org_id, issue_id, sequence required' });
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
