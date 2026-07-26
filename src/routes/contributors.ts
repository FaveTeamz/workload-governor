import { Router, Request, Response } from 'express';
import { Address } from '@stellar/stellar-sdk';
import { pool } from '../db';

const router = Router();

function isValidStellarAddress(address: string): boolean {
  try {
    new Address(address);
    return true;
  } catch {
    return false;
  }
}

interface ContributorApplicationRow {
  contributor: string;
  org_id: string;
  issue_id: number;
  created_at: string;
  title: string;
  status: string;
}

interface ContributorAssignmentRow {
  contributor: string;
  org_id: string;
  issue_id: number;
  created_at: string;
  title: string;
  status: string;
}

interface CountsRow {
  org_id: string;
  applications: string;
  assignments: string;
}

interface ContributorCountsResponse {
  totalApplications: number;
  totalAssignments: number;
  byOrganization: Array<{
    org_id: string;
    applications: number;
    assignments: number;
  }>;
}

router.get('/:address/applications', async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!isValidStellarAddress(address)) {
    res.status(400).json({ error: 'invalid stellar address format' });
    return;
  }

  try {
    const { rows } = await pool.query<ContributorApplicationRow>(
      `SELECT a.contributor, a.org_id, a.issue_id, a.created_at, i.title, i.status
       FROM applications a
       JOIN issues i ON i.id = a.issue_id
       WHERE a.contributor = $1
       ORDER BY a.created_at DESC`,
      [address],
    );
    res.json(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: msg });
  }
});

router.get('/:address/assignments', async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!isValidStellarAddress(address)) {
    res.status(400).json({ error: 'invalid stellar address format' });
    return;
  }

  try {
    const { rows } = await pool.query<ContributorAssignmentRow>(
      `SELECT a.contributor, a.org_id, a.issue_id, a.created_at, i.title, i.status
       FROM assignments a
       JOIN issues i ON i.id = a.issue_id
       WHERE a.contributor = $1
       ORDER BY a.created_at DESC`,
      [address],
    );
    res.json(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: msg });
  }
});

router.get('/:address/counts', async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!isValidStellarAddress(address)) {
    res.status(400).json({ error: 'invalid stellar address format' });
    return;
  }

  try {
    const applicationsResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM applications WHERE contributor = $1`,
      [address],
    );
    const totalApplications = parseInt(applicationsResult.rows[0]?.count || '0', 10);

    const assignmentsResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM assignments WHERE contributor = $1`,
      [address],
    );
    const totalAssignments = parseInt(assignmentsResult.rows[0]?.count || '0', 10);

    const byOrgResult = await pool.query<CountsRow>(
      `SELECT
        org_id,
        COALESCE(SUM(CASE WHEN type = 'application' THEN 1 ELSE 0 END), 0) as applications,
        COALESCE(SUM(CASE WHEN type = 'assignment' THEN 1 ELSE 0 END), 0) as assignments
       FROM (
         SELECT org_id, 'application' as type FROM applications WHERE contributor = $1
         UNION ALL
         SELECT org_id, 'assignment' as type FROM assignments WHERE contributor = $1
       ) combined
       GROUP BY org_id
       ORDER BY org_id`,
      [address],
    );

    const response: ContributorCountsResponse = {
      totalApplications,
      totalAssignments,
      byOrganization: byOrgResult.rows.map((row) => ({
        org_id: row.org_id,
        applications: parseInt(row.applications as unknown as string, 10),
        assignments: parseInt(row.assignments as unknown as string, 10),
      })),
    };

    res.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: msg });
  }
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
