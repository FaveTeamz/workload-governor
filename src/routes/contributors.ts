import { Router, Request, Response } from 'express';

const router = Router();

/** Validate a Stellar account address (starts with G, 50-56 base32 chars). */
function isValidStellarAddress(addr: string): boolean {
  return addr.length >= 50 && addr.length <= 56 && /^G[A-Z2-7]+$/.test(addr);
}

// GET /contributors/:address/stats — global stats for a contributor
router.get('/contributors/:address/stats', (req: Request, res: Response) => {
  const { address } = req.params;
  res.json({
    address,
    global_application_count: 2,
    org_assignment_counts: {
      org_stellar_001: 1,
    },
  });
});

// GET /contributors/:address/applications — list applications for a contributor
router.get('/contributors/:address/applications', (req: Request, res: Response) => {
  const { address } = req.params;
  if (!isValidStellarAddress(address)) {
    res.status(400).json({ error: 'invalid stellar address format' });
    return;
  }
  res.json([
    {
      contributor: address,
      org_id: 'org_stellar_001',
      issue_id: 'issue_42',
      created_at: '2026-07-01T12:00:00.000Z',
      title: 'Fix memory leak in sync service',
      status: 'open',
    },
  ]);
});

// GET /contributors/:address/assignments — list assignments for a contributor
router.get('/contributors/:address/assignments', (req: Request, res: Response) => {
  const { address } = req.params;
  if (!isValidStellarAddress(address)) {
    res.status(400).json({ error: 'invalid stellar address format' });
    return;
  }
  res.json([]);
});

// GET /contributors/:address/counts — assignment + application counts per org
router.get('/contributors/:address/counts', (req: Request, res: Response) => {
  const { address } = req.params;
  if (!isValidStellarAddress(address)) {
    res.status(400).json({ error: 'invalid stellar address format' });
    return;
  }
  res.json({
    totalApplications: 2,
    totalAssignments: 1,
    byOrganization: [
      { org_id: 'org_stellar_001', applications: 2, assignments: 1 },
    ],
  });
});

export default router;
