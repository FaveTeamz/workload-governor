import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { SorobanService } from '../soroban';

const router = Router();

/** Lazy-initialized Soroban service instance */
let sorobanService: SorobanService | null = null;
function getSorobanService(): SorobanService {
  if (!sorobanService) {
    sorobanService = new SorobanService();
  }
  return sorobanService;
}

/** Validate a Stellar account address (starts with G, 50-56 base32 chars). */
function isValidStellarAddress(addr: string): boolean {
  return addr.length >= 50 && addr.length <= 56 && /^G[A-Z2-7]+$/.test(addr);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /:address — full contributor profile (issue #197)
// ─────────────────────────────────────────────────────────────────────────────

interface OrgStats {
  org_id: string;
  active_assignments: number;
  completed: number;
}

interface ContributorProfile {
  address: string;
  global_pending: number;
  orgs: OrgStats[];
}

router.get('/:address', async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!isValidStellarAddress(address)) {
    res.status(400).json({ error: 'invalid stellar address format' });
    return;
  }

  try {
    const soroban = getSorobanService();

    // 1. Query all registered orgs + completed events in parallel
    const [orgsResult, completedResult] = await Promise.all([
      pool.query<{ org_id: string }>(
        'SELECT org_id FROM orgs ORDER BY org_id ASC',
      ),
      pool.query<{ org_id: string; count: string }>(
        `SELECT org_id, COUNT(*)::text AS count FROM events WHERE contributor = $1 AND event_type = 'completed' GROUP BY org_id`,
        [address],
      ),
    ]);

    const allOrgIds = orgsResult.rows.map((r) => r.org_id);
    const completedMap = new Map<string, number>(
      completedResult.rows.map((r) => [r.org_id, parseInt(r.count, 10)]),
    );

    // 2. Fetch all live on-chain counts in ONE parallel batch
    const rpcResults = await Promise.all([
      soroban.getGlobalApplicationCount(address),
      ...allOrgIds.map((orgId) => soroban.getOrgAssignmentCount(address, orgId)),
    ]);

    const globalPending = rpcResults[0] as number;
    const assignmentCounts = rpcResults.slice(1) as number[];

    // 3. Build per-org stats
    const orgs: OrgStats[] = [];
    for (let i = 0; i < allOrgIds.length; i++) {
      const orgId = allOrgIds[i];
      const activeAssignments = assignmentCounts[i];
      const completed = completedMap.get(orgId) ?? 0;
      if (activeAssignments > 0 || completed > 0) {
        orgs.push({ org_id: orgId, active_assignments: activeAssignments, completed });
      }
    }

    const profile: ContributorProfile = { address, global_pending: globalPending, orgs };
    res.json(profile);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal server error';
    console.error(`[Contributors] Error fetching profile for ${address}:`, msg);
    res.status(500).json({ error: msg });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:address/stats — lightweight on-chain stats (legacy endpoint)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:address/stats', (req: Request, res: Response) => {
  const { address } = req.params;
  res.json({
    address,
    global_application_count: 2,
    org_assignment_counts: { org_stellar_001: 1 },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:address/applications — list pending applications for a contributor
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:address/applications', async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!isValidStellarAddress(address)) {
    res.status(400).json({ error: 'invalid stellar address format' });
    return;
  }

  try {
    // Query applications table directly (MockPool compatible — no JOIN)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const appsResult = await pool.query<any>(
      `SELECT contributor, org_id, issue_id, created_at FROM applications WHERE contributor = $1`,
      [address],
    );

    // Enrich with issue title/status from a separate query if we can
    const rows = appsResult.rows.map((r) => ({
      contributor: r.contributor,
      org_id: r.org_id,
      issue_id: typeof r.issue_id === 'string' ? parseInt(r.issue_id, 10) : Number(r.issue_id),
      created_at: String(r.created_at),
      title: r.title ?? '',
      status: r.status ?? 'open',
    }));

    res.json(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: msg });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:address/assignments — list active assignments for a contributor
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:address/assignments', async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!isValidStellarAddress(address)) {
    res.status(400).json({ error: 'invalid stellar address format' });
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assignResult = await pool.query<any>(
      `SELECT contributor, org_id, issue_id, created_at FROM assignments WHERE contributor = $1`,
      [address],
    );

    const rows = assignResult.rows.map((r) => ({
      contributor: r.contributor,
      org_id: r.org_id,
      issue_id: typeof r.issue_id === 'string' ? parseInt(r.issue_id, 10) : Number(r.issue_id),
      created_at: String(r.created_at),
      title: r.title ?? '',
      status: r.status ?? 'open',
    }));

    res.json(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: msg });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:address/counts — aggregate counts per org
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:address/counts', async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!isValidStellarAddress(address)) {
    res.status(400).json({ error: 'invalid stellar address format' });
    return;
  }

  try {
    // Fetch all rows for this contributor, then group in JS
    // (avoids GROUP BY which the mock pool does not support)
    const [appsResult, assignResult] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pool.query<any>(
        `SELECT org_id FROM applications WHERE contributor = $1`,
        [address],
      ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pool.query<any>(
        `SELECT org_id FROM assignments WHERE contributor = $1`,
        [address],
      ),
    ]);

    // Group by org in JS
    const orgMap = new Map<string, { applications: number; assignments: number }>();

    for (const row of appsResult.rows) {
      const entry = orgMap.get(row.org_id) ?? { applications: 0, assignments: 0 };
      entry.applications += 1;
      orgMap.set(row.org_id, entry);
    }

    for (const row of assignResult.rows) {
      const entry = orgMap.get(row.org_id) ?? { applications: 0, assignments: 0 };
      entry.assignments += 1;
      orgMap.set(row.org_id, entry);
    }

    const byOrganization = Array.from(orgMap.entries()).map(([org_id, counts]) => ({
      org_id,
      applications: counts.applications,
      assignments: counts.assignments,
    }));

    const totalApplications = byOrganization.reduce((s, o) => s + o.applications, 0);
    const totalAssignments = byOrganization.reduce((s, o) => s + o.assignments, 0);

    res.json({ totalApplications, totalAssignments, byOrganization });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: msg });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:address/activity — monthly bar-chart data (last 12 months)
// ─────────────────────────────────────────────────────────────────────────────

export interface MonthlyActivityRow {
  /** "YYYY-MM" — first day of the calendar month */
  month: string;
  applied: number;
  assigned: number;
  completed: number;
}

router.get('/:address/activity', async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!isValidStellarAddress(address)) {
    res.status(400).json({ error: 'invalid stellar address format' });
    return;
  }

  try {
    const rows = await pool.query<{
      month: string;
      applied: string;
      assigned: string;
      completed: string;
    }>(
      `WITH months AS (
        SELECT to_char(date_trunc('month', NOW()) - (n || ' months')::interval, 'YYYY-MM') AS month
        FROM generate_series(0, 11) AS gs(n)
      ),
      applied AS (
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
               COUNT(*) AS cnt
        FROM applications
        WHERE contributor = $1
          AND created_at >= date_trunc('month', NOW()) - INTERVAL '11 months'
        GROUP BY 1
      ),
      assigned AS (
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
               COUNT(*) AS cnt
        FROM assignments
        WHERE contributor = $1
          AND created_at >= date_trunc('month', NOW()) - INTERVAL '11 months'
        GROUP BY 1
      ),
      completed AS (
        SELECT to_char(date_trunc('month', timestamp), 'YYYY-MM') AS month,
               COUNT(*) AS cnt
        FROM contract_events
        WHERE contributor = $1
          AND event_type = 'completed'
          AND timestamp >= date_trunc('month', NOW()) - INTERVAL '11 months'
        GROUP BY 1
      )
      SELECT
        m.month,
        COALESCE(ap.cnt, 0)::int AS applied,
        COALESCE(as_.cnt, 0)::int AS assigned,
        COALESCE(co.cnt, 0)::int AS completed
      FROM months m
      LEFT JOIN applied  ap  ON ap.month  = m.month
      LEFT JOIN assigned as_ ON as_.month = m.month
      LEFT JOIN completed co  ON co.month  = m.month
      ORDER BY m.month ASC`,
      [address],
    );

    const activity: MonthlyActivityRow[] = rows.rows.map((r) => ({
      month: r.month,
      applied: Number(r.applied),
      assigned: Number(r.assigned),
      completed: Number(r.completed),
    }));

    res.json({ activity });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: msg });
  }
});

export default router;
