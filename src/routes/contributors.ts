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

export default router;
