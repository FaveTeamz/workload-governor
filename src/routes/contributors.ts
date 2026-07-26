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

export default router;
