import { Router, Request, Response } from 'express';
import { validateBody } from '../middleware/validation';
import { orgApplyBodySchema, OrgApplyBody } from '../schemas/orgs';
import { getCache, setCache } from '../services/redis';

const router = Router();

// ---------------------------------------------------------------------------
// Known orgs for stub implementation
// ---------------------------------------------------------------------------
const KNOWN_ORGS = ['stellar-oss', 'org_stellar_001'];

// ---------------------------------------------------------------------------
// Stats cache TTL: 15 minutes (900 seconds)
// ---------------------------------------------------------------------------
const STATS_CACHE_TTL_SEC = 900;

// ---------------------------------------------------------------------------
// Valid period values for the stats endpoint
// ---------------------------------------------------------------------------
const VALID_PERIODS = ['7d', '30d', '90d'] as const;
type StatsPeriod = (typeof VALID_PERIODS)[number];

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

// ---------------------------------------------------------------------------
// GET /orgs/:orgId/stats?period=7d|30d|90d — org activity statistics
// ---------------------------------------------------------------------------
/**
 * Returns aggregated statistics for an organisation over the requested period.
 *
 * Query parameters:
 *   period   7d | 30d | 90d  (default: 7d)
 *
 * Response shape:
 *   {
 *     org_id,
 *     period,
 *     generated_at,          // ISO timestamp
 *     summary: {
 *       total_applications,
 *       total_assignments,
 *       total_completions,
 *       total_revocations,
 *       unique_contributors,
 *       avg_time_to_assignment_hours,
 *       avg_time_to_completion_hours,
 *     },
 *     daily: [               // one entry per calendar day in the period
 *       { date, applications, assignments, completions, revocations }
 *     ]
 *   }
 *
 * Cache: results are cached in Redis for 15 minutes (STATS_CACHE_TTL_SEC).
 *
 * Auth: requires a valid API key (Bearer token). Returns 404 for unknown orgs.
 */
router.get('/orgs/:orgId/stats', async (req: Request, res: Response) => {
  const { orgId } = req.params;

  if (!isKnownOrg(orgId)) {
    res.status(404).json({
      error: 'not_found',
      message: `Org '${orgId}' not found`,
      code: 'NOT_FOUND',
    });
    return;
  }

  const rawPeriod = String(req.query['period'] ?? '7d') as string;
  if (!(VALID_PERIODS as readonly string[]).includes(rawPeriod)) {
    res.status(400).json({
      error: 'bad_request',
      message: `Invalid period '${rawPeriod}'. Must be one of: ${VALID_PERIODS.join(', ')}`,
      code: 'INVALID_REQUEST',
    });
    return;
  }
  const period = rawPeriod as StatsPeriod;

  // Check cache first
  const cacheKey = `stats:${orgId}:${period}`;
  try {
    const cached = await getCache<unknown>(cacheKey);
    if (cached !== null) {
      res.set('X-Cache', 'HIT');
      res.json(cached);
      return;
    }
  } catch {
    // Cache miss or Redis unavailable — continue to generate fresh stats
  }

  // Compute the number of calendar days in the period
  const periodDays: Record<StatsPeriod, number> = { '7d': 7, '30d': 30, '90d': 90 };
  const days = periodDays[period];

  // Build daily time-series (stub data — in production this would be a DB query)
  const now = new Date();
  const daily = Array.from({ length: days }, (_, i) => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - (days - 1 - i));
    const dateStr = date.toISOString().split('T')[0];

    // Deterministic stub values based on org and day index
    const seed = (orgId.length + i + 1);
    return {
      date: dateStr,
      applications: Math.max(0, (seed * 3) % 7),
      assignments: Math.max(0, (seed * 2) % 5),
      completions: Math.max(0, seed % 4),
      revocations: Math.max(0, seed % 2),
    };
  });

  // Compute summary totals from daily data
  const totalApplications = daily.reduce((s, d) => s + d.applications, 0);
  const totalAssignments = daily.reduce((s, d) => s + d.assignments, 0);
  const totalCompletions = daily.reduce((s, d) => s + d.completions, 0);
  const totalRevocations = daily.reduce((s, d) => s + d.revocations, 0);

  // Stub unique contributor count and average times
  const uniqueContributors = Math.max(1, Math.floor(totalApplications * 0.6));
  const avgTimeToAssignmentHours = totalAssignments > 0
    ? parseFloat((18 + (orgId.length % 24)).toFixed(1))
    : 0;
  const avgTimeToCompletionHours = totalCompletions > 0
    ? parseFloat((72 + (orgId.length % 48)).toFixed(1))
    : 0;

  const payload = {
    org_id: orgId,
    period,
    generated_at: now.toISOString(),
    summary: {
      total_applications: totalApplications,
      total_assignments: totalAssignments,
      total_completions: totalCompletions,
      total_revocations: totalRevocations,
      unique_contributors: uniqueContributors,
      avg_time_to_assignment_hours: avgTimeToAssignmentHours,
      avg_time_to_completion_hours: avgTimeToCompletionHours,
    },
    daily,
  };

  // Persist to cache for 15 minutes
  try {
    await setCache(cacheKey, payload, STATS_CACHE_TTL_SEC);
  } catch {
    // Non-fatal: serve the response even if Redis is down
  }

  res.set('X-Cache', 'MISS');
  res.json(payload);
});

export default router;
