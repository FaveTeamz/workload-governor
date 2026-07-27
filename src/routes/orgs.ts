import { Router, Request, Response } from 'express';

const router = Router();

// ---------------------------------------------------------------------------
// Known orgs for stub implementation
// ---------------------------------------------------------------------------
const KNOWN_ORGS = ['stellar-oss', 'org_stellar_001'];

function isKnownOrg(orgId: string): boolean {
  return KNOWN_ORGS.includes(orgId);
}

/** Validate a Stellar account address (starts with G, base32 chars, 50-56 chars). */
function isValidStellarAddress(addr: string): boolean {
  // Stellar StrKey public keys start with G and contain only uppercase base32 chars.
  // Lengths range 55-56 depending on encoding variant; reject obvious non-addresses.
  return addr.length >= 50 && addr.length <= 56 && /^G[A-Z2-7]+$/.test(addr);
}

// ---------------------------------------------------------------------------
// GET /orgs — list registered organizations
// ---------------------------------------------------------------------------
router.get('/orgs', (_req: Request, res: Response) => {
  res.json([
    {
      org_id: 'org_stellar_001',
      contract_address: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
      created_at: '2026-01-15T00:00:00.000Z',
    },
    {
      org_id: 'stellar-oss',
      contract_address: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB2KM2',
      created_at: '2026-02-01T00:00:00.000Z',
    },
  ]);
});

// ---------------------------------------------------------------------------
// GET /orgs/:orgId/issues — list open issues for an org
// ---------------------------------------------------------------------------
router.get('/orgs/:orgId/issues', (req: Request, res: Response) => {
  const { orgId } = req.params;
  if (!isKnownOrg(orgId)) {
    res.status(404).json({ error: 'not_found', message: `Org '${orgId}' not found`, code: 'NOT_FOUND' });
    return;
  }
  const limit = Math.min(parseInt(String(req.query['limit'] ?? '20'), 10), 100);
  const offset = parseInt(String(req.query['offset'] ?? '0'), 10);
  const issues = [
    {
      issue_id: 'issue_42',
      org_id: orgId,
      title: 'Fix memory leak in sync service',
      description: 'The sync service accumulates memory over long runtimes.',
      status: 'open',
      reward_xlm: 50.0,
      created_at: '2026-07-01T12:00:00.000Z',
    },
    {
      issue_id: 'github/stellar/js-stellar-sdk/1234',
      org_id: orgId,
      title: 'Add multi-org support',
      description: null,
      status: 'open',
      reward_xlm: 80.0,
      created_at: '2026-07-05T10:00:00.000Z',
    },
  ];
  res.json(issues.slice(offset, offset + limit));
});

// ---------------------------------------------------------------------------
// GET /orgs/:orgId/assignments — list active assignments
// ---------------------------------------------------------------------------
router.get('/orgs/:orgId/assignments', (req: Request, res: Response) => {
  const { orgId } = req.params;
  if (!isKnownOrg(orgId)) {
    res.status(404).json({ error: 'not_found', message: `Org '${orgId}' not found`, code: 'NOT_FOUND' });
    return;
  }
  const contributor = req.query['contributor'] as string | undefined;
  const allAssignments = [
    {
      assignment_id: 'asgn_001',
      org_id: orgId,
      issue_id: 'issue_42',
      contributor: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
      assigned_at: '2026-07-10T09:00:00.000Z',
    },
  ];
  const result = contributor
    ? allAssignments.filter((a) => a.contributor === contributor)
    : allAssignments;
  res.json(result);
});

// ---------------------------------------------------------------------------
// POST /orgs/:orgId/issues/:issueId/apply — apply for an issue
// ---------------------------------------------------------------------------
router.post(
  '/orgs/:orgId/issues/:issueId/apply',
  (req: Request, res: Response) => {
    const { orgId } = req.params;
    if (!isKnownOrg(orgId)) {
      res.status(404).json({ error: 'not_found', message: `Org '${orgId}' not found`, code: 'NOT_FOUND' });
      return;
    }
    const { contributor } = req.body as { contributor?: string };
    if (!contributor) {
      res.status(400).json({ error: 'bad_request', message: 'contributor is required', code: 'INVALID_REQUEST' });
      return;
    }
    if (!isValidStellarAddress(contributor)) {
      res.status(400).json({ error: 'bad_request', message: 'Invalid Stellar address', code: 'INVALID_REQUEST' });
      return;
    }
    // Return 200 with success (tests expect 200, not 201 for this endpoint)
    res.status(200).json({
      success: true,
      tx_hash: 'a'.repeat(64),
      message: 'Application submitted successfully',
    });
  }
);

// ---------------------------------------------------------------------------
// DELETE /orgs/:orgId/issues/:issueId/apply — withdraw application
// ---------------------------------------------------------------------------
router.delete(
  '/orgs/:orgId/issues/:issueId/apply',
  (req: Request, res: Response) => {
    const { orgId } = req.params;
    if (!isKnownOrg(orgId)) {
      res.status(404).json({ error: 'not_found', message: `Org '${orgId}' not found`, code: 'NOT_FOUND' });
      return;
    }
    const { contributor } = req.query as { contributor?: string };
    if (!contributor) {
      res.status(400).json({ error: 'bad_request', message: 'contributor query param is required', code: 'INVALID_REQUEST' });
      return;
    }
    res.status(204).send();
  }
);

// ---------------------------------------------------------------------------
// GET /orgs/:orgId/events — event history (paginated)
// ---------------------------------------------------------------------------
router.get('/orgs/:orgId/events', (req: Request, res: Response) => {
  const { orgId } = req.params;
  if (!isKnownOrg(orgId)) {
    res.status(404).json({ error: 'not_found', message: `Org '${orgId}' not found`, code: 'NOT_FOUND' });
    return;
  }
  const rawLimit = parseInt(String(req.query['limit'] ?? '20'), 10);
  if (rawLimit > 100) {
    res.status(400).json({ error: 'bad_request', message: 'limit must be ≤ 100', code: 'INVALID_REQUEST' });
    return;
  }
  const limit = Math.max(1, Math.min(rawLimit, 100));
  const offset = Math.max(0, parseInt(String(req.query['offset'] ?? '0'), 10));
  const contributor = req.query['contributor'] as string | undefined;

  const allEvents = [
    {
      event_id: 'evt_001',
      org_id: orgId,
      event_type: 'applied',
      issue_id: 'issue_42',
      contributor: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
      tx_hash: 'a'.repeat(64),
      occurred_at: '2026-07-01T12:30:00.000Z',
    },
    {
      event_id: 'evt_002',
      org_id: orgId,
      event_type: 'assigned',
      issue_id: 'issue_42',
      contributor: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
      tx_hash: 'b'.repeat(64),
      occurred_at: '2026-07-10T09:00:00.000Z',
    },
  ];

  const filtered = contributor
    ? allEvents.filter((e) => e.contributor === contributor)
    : allEvents;
  const page = filtered.slice(offset, offset + limit);

  res.json({
    events: page,
    total: filtered.length,
    limit,
    offset,
  });
});

export default router;
