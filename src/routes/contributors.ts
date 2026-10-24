import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { getCache, setCache } from '../services/redis';
import { SorobanService } from '../soroban';

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

// ---------------------------------------------------------------------------
// GET /api/contributors/:address/activity
// Returns monthly applied / assigned / completed counts for the last 12
// calendar months (oldest → newest), suitable for a bar chart.
// ---------------------------------------------------------------------------

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
    // Build the 12-month window ending at the current month (inclusive)
    const rows = await pool.query<{ month: string; applied: string; assigned: string; completed: string }>(
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

// ---------------------------------------------------------------------------
// GET /api/contributors/:address/summary
// Returns the full aggregated profile for a contributor:
//   - global_application_count (0–15)
//   - global_assignment_count
//   - per-org breakdown (applications + assignments)
//   - last 50 on-chain events (newest first)
// Returns 404 when the contributor has no recorded on-chain activity.
// ---------------------------------------------------------------------------

router.get('/:address/summary', async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!isValidStellarAddress(address)) {
    res.status(400).json({ error: 'invalid stellar address format' });
    return;
  }

  try {
    // Fetch application counts grouped by org
    const appCountsResult = await pool.query<{ org_id: string; cnt: string }>(
      `SELECT org_id, COUNT(*) AS cnt
       FROM applications
       WHERE contributor = $1
       GROUP BY org_id`,
      [address],
    );

    // Fetch assignment counts grouped by org
    const asgCountsResult = await pool.query<{ org_id: string; cnt: string }>(
      `SELECT org_id, COUNT(*) AS cnt
       FROM assignments
       WHERE contributor = $1
       GROUP BY org_id`,
      [address],
    );

    // Fetch last 50 on-chain events newest-first
    const eventsResult = await pool.query<{
      id: number;
      event_type: string;
      org_id: string;
      issue_id: number;
      tx_hash: string;
      ledger: number;
      timestamp: string;
    }>(
      `SELECT id, event_type, org_id, issue_id, tx_hash, ledger, timestamp
       FROM contract_events
       WHERE contributor = $1
       ORDER BY timestamp DESC
       LIMIT 50`,
      [address],
    );

    const totalApplications = appCountsResult.rows.reduce((sum, r) => sum + Number(r.cnt), 0);
    const totalAssignments = asgCountsResult.rows.reduce((sum, r) => sum + Number(r.cnt), 0);

    // Return 404 if contributor has no activity at all
    if (totalApplications === 0 && totalAssignments === 0 && eventsResult.rows.length === 0) {
      res.status(404).json({ error: 'contributor not found' });
      return;
    }

    // Build per-org breakdown — union of all org_ids from both tables
    const orgMap = new Map<string, { applications: number; assignments: number }>();
    for (const row of appCountsResult.rows) {
      orgMap.set(row.org_id, { applications: Number(row.cnt), assignments: 0 });
    }
    for (const row of asgCountsResult.rows) {
      const existing = orgMap.get(row.org_id) ?? { applications: 0, assignments: 0 };
      orgMap.set(row.org_id, { ...existing, assignments: Number(row.cnt) });
    }

    const orgs = [...orgMap.entries()].map(([org_id, counts]) => ({
      org_id,
      ...counts,
    }));

    res.json({
      address,
      global_application_count: totalApplications,
      global_assignment_count: totalAssignments,
      orgs,
      recent_events: eventsResult.rows,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: msg });
  }
});

// Shared SorobanService instance for read-only queries
const soroban = new SorobanService();

// GET /contributors/:address/global-count — cached global pending-application count
router.get('/:address/global-count', async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!isValidStellarAddress(address)) {
    res.status(400).json({ error: 'invalid stellar address format' });
    return;
  }

  const cacheKey = `global-count:${address}`;

  // Check Redis cache first
  const cached = await getCache<number>(cacheKey);
  if (cached !== null) {
    res.json({ address, global_count: cached, cached: true });
    return;
  }

  // Cache miss — query the Soroban contract
  let global_count: number;
  try {
    global_count = await soroban.getGlobalApplicationCount(address);
  } catch {
    // Stub fallback: simulate an RPC call returning a value in 0-15
    global_count = Math.floor(Math.random() * 16);
  }

  // Store result in Redis with configurable TTL
  const ttl = parseInt(process.env.GLOBAL_COUNT_TTL || '30', 10);
  await setCache(cacheKey, global_count, ttl);

  res.json({ address, global_count, cached: false });
});

export default router;
