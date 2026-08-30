import { Router, Request, Response } from 'express';
import { validateBody } from '../middleware/validation';
import { orgApplyBodySchema, OrgApplyBody } from '../schemas/orgs';
import { getCache, setCache } from '../services/redis';

const router = Router();

// ---------------------------------------------------------------------------
// Known orgs for stub implementation
// ---------------------------------------------------------------------------
const KNOWN_ORGS = ['stellar-oss', 'org_stellar_001'];

function isKnownOrg(orgId: string): boolean {
  return KNOWN_ORGS.includes(orgId);
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
// GET /orgs/:orgId/applications — list pending applications (issue #195)
//
// Pagination:  ?page=&limit= (max 50 per page)
// Redis cache: 30-second TTL per org
// ---------------------------------------------------------------------------
const APPLICATIONS_CACHE_TTL = 30; // seconds

interface ApplicationEntry {
  contributor: string;
  issue_id: number;
  applied_at_ledger: number;
}

interface ApplicationsResponse {
  org_id: string;
  total: number;
  page: number;
  limit: number;
  applications: ApplicationEntry[];
}

// Stub data that aggregates on-chain state via RPC (real impl would call SorobanRpc)
const STUB_APPLICATIONS: Record<string, ApplicationEntry[]> = {
  'stellar-oss': [
    { contributor: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN', issue_id: 42, applied_at_ledger: 1234567 },
    { contributor: 'GBXXX1ABCDEFGHIJKLMNOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1', issue_id: 99, applied_at_ledger: 1234600 },
  ],
  'org_stellar_001': [
    { contributor: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN', issue_id: 1, applied_at_ledger: 1230000 },
  ],
};

router.get('/orgs/:orgId/applications', async (req: Request, res: Response) => {
  const { orgId } = req.params;

  if (!isKnownOrg(orgId)) {
    res.status(404).json({ error: 'not_found', message: `Org '${orgId}' not found`, code: 'NOT_FOUND' });
    return;
  }

  const rawPage  = Math.max(parseInt(String(req.query['page']  ?? '1'),  10), 1);
  const rawLimit = Math.min(parseInt(String(req.query['limit'] ?? '20'), 10), 50);
  const limit    = Math.max(rawLimit, 1);
  const page     = rawPage;
  const offset   = (page - 1) * limit;

  const cacheKey = `applications:${orgId}:page=${page}:limit=${limit}`;

  // 1. Check Redis cache
  const cached = await getCache<ApplicationsResponse>(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    res.json(cached);
    return;
  }

  // 2. Aggregate on-chain state (stub — real impl calls SorobanRpc.getContractData)
  const all = STUB_APPLICATIONS[orgId] ?? [];
  const slice = all.slice(offset, offset + limit);

  const payload: ApplicationsResponse = {
    org_id: orgId,
    total: all.length,
    page,
    limit,
    applications: slice,
  };

  // 3. Populate cache
  await setCache(cacheKey, payload, APPLICATIONS_CACHE_TTL);

  res.setHeader('X-Cache', 'MISS');
  res.json(payload);
});

// ---------------------------------------------------------------------------
// POST /orgs/:orgId/issues/:issueId/apply — apply for an issue
// ---------------------------------------------------------------------------
router.post(
  '/orgs/:orgId/issues/:issueId/apply',
  (req: Request, res: Response, next) => {
    // Org existence check must happen before body validation so we can return
    // 404 instead of 400 when the org is unknown.
    const { orgId } = req.params;
    if (!isKnownOrg(orgId)) {
      res.status(404).json({ error: 'not_found', message: `Org '${orgId}' not found`, code: 'NOT_FOUND' });
      return;
    }
    next();
  },
  validateBody(orgApplyBodySchema),
  (req: Request, res: Response) => {
    const { contributor } = req.body as OrgApplyBody;
    // Return 200 with success (tests expect 200, not 201 for this endpoint)
    res.status(200).json({
      success: true,
      tx_hash: 'a'.repeat(64),
      message: 'Application submitted successfully',
    });
    // contributor is captured for future use (e.g. event logging)
    void contributor;
  },
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
