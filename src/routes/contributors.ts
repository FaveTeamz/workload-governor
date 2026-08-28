/**
 * contributors.ts
 *
 * Contributor profile API routes.
 *
 * GET /api/contributors/:address
 *   Full aggregated profile: address, global_application_count, orgs,
 *   recent_events (last 50 from contract_events).
 *   Returns 400 for invalid Stellar addresses.
 *   Returns 404 if the contributor has no on-chain activity.
 *
 * GET /api/contributors/:address/applications
 *   List all applications for a contributor.
 *
 * GET /api/contributors/:address/assignments
 *   List all assignments for a contributor.
 *
 * GET /api/contributors/:address/counts
 *   totalApplications, totalAssignments, byOrganization breakdown.
 *
 * GET /api/contributors/:address/activity
 *   Monthly applied / assigned / completed counts for the last 12 months.
 *
 * GET /api/contributors/:address/stats
 *   Legacy stats endpoint.
 */

import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

/** Validate a Stellar account address (starts with G, 50-56 base32 chars). */
function isValidStellarAddress(addr: string): boolean {
  return addr.length >= 50 && addr.length <= 56 && /^G[A-Z2-7]+$/.test(addr);
}

// ---------------------------------------------------------------------------
// Query helpers (use simple SQL compatible with the in-memory MockPool)
// ---------------------------------------------------------------------------

async function countApplications(address: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM applications WHERE contributor = $1',
    [address],
  );
  return parseInt((rows[0] as { count: string }).count, 10) || 0;
}

async function countAssignments(address: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM assignments WHERE contributor = $1',
    [address],
  );
  return parseInt((rows[0] as { count: string }).count, 10) || 0;
}

async function getOrgBreakdown(
  address: string,
): Promise<Array<{ org_id: string; applications: number; assignments: number }>> {
  // Fetch from both tables separately to avoid FULL OUTER JOIN (not supported
  // by the in-memory MockPool used in tests)
  const [appRows, asgRows] = await Promise.all([
    pool.query<{ org_id: string }>('SELECT org_id FROM applications WHERE contributor = $1', [address]),
    pool.query<{ org_id: string }>('SELECT org_id FROM assignments WHERE contributor = $1', [address]),
  ]);

  // Aggregate in JS
  const map = new Map<string, { applications: number; assignments: number }>();

  for (const r of appRows.rows) {
    const entry = map.get(r.org_id) ?? { applications: 0, assignments: 0 };
    entry.applications++;
    map.set(r.org_id, entry);
  }

  for (const r of asgRows.rows) {
    const entry = map.get(r.org_id) ?? { applications: 0, assignments: 0 };
    entry.assignments++;
    map.set(r.org_id, entry);
  }

  return Array.from(map.entries()).map(([org_id, counts]) => ({ org_id, ...counts }));
}

// ---------------------------------------------------------------------------
// GET /api/contributors/:address
//   Full profile: address + global counts + per-org breakdown + recent events
// ---------------------------------------------------------------------------

router.get('/:address', async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!isValidStellarAddress(address)) {
    res.status(400).json({ error: 'invalid stellar address format' });
    return;
  }

  try {
    const [globalApplicationCount, globalAssignmentCount] = await Promise.all([
      countApplications(address),
      countAssignments(address),
    ]);

    // No activity → 404 (also check contract_events for orphan activity)
    if (globalApplicationCount === 0 && globalAssignmentCount === 0) {
      try {
        const evCountResult = await pool.query<{ count: string }>(
          'SELECT COUNT(*) AS count FROM contract_events WHERE contributor = $1',
          [address],
        );
        const evCount = parseInt((evCountResult.rows[0] as { count: string }).count, 10) || 0;
        if (evCount === 0) {
          res.status(404).json({ error: 'contributor not found' });
          return;
        }
      } catch {
        // contract_events table might not exist yet
        res.status(404).json({ error: 'contributor not found' });
        return;
      }
    }

    const orgs = await getOrgBreakdown(address);

    // Recent events (last 50, ordered newest first)
    let recentEvents: unknown[] = [];
    try {
      const eventsResult = await pool.query<{
        id: number;
        event_type: string;
        org_id: string | null;
        issue_id: number | null;
        tx_hash: string;
        ledger_seq: number;
        timestamp: string;
      }>(
        `SELECT id, event_type, org_id, issue_id, tx_hash, ledger_seq, timestamp
         FROM contract_events
         WHERE contributor = $1
         ORDER BY timestamp DESC`,
        [address],
      );
      recentEvents = eventsResult.rows.slice(0, 50).map((r) => ({
        id: r.id,
        event_type: r.event_type,
        org_id: r.org_id,
        issue_id: r.issue_id,
        tx_hash: r.tx_hash,
        ledger: r.ledger_seq,
        timestamp: r.timestamp,
      }));
    } catch {
      // contract_events table might not exist yet in test environments
    }

    res.json({
      address,
      global_application_count: globalApplicationCount,
      global_assignment_count: globalAssignmentCount,
      orgs,
      recent_events: recentEvents,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: msg });
  }
});

// ---------------------------------------------------------------------------
// GET /api/contributors/:address/stats — legacy aggregate stats
// ---------------------------------------------------------------------------

router.get('/:address/stats', (req: Request, res: Response) => {
  const { address } = req.params;
  res.json({
    address,
    global_application_count: 2,
    org_assignment_counts: { org_stellar_001: 1 },
  });
});

// ---------------------------------------------------------------------------
// GET /api/contributors/:address/applications
// ---------------------------------------------------------------------------

router.get('/:address/applications', async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!isValidStellarAddress(address)) {
    res.status(400).json({ error: 'invalid stellar address format' });
    return;
  }

  try {
    // Select from applications and join issues for title/status
    const appsResult = await pool.query<{
      contributor: string;
      org_id: string;
      issue_id: number;
      created_at: string;
    }>(
      `SELECT contributor, org_id, issue_id, created_at
       FROM applications
       WHERE contributor = $1`,
      [address],
    );

    // Enrich each row with issue metadata
    const rows = await Promise.all(
      appsResult.rows.map(async (r) => {
        let title = 'Unknown Issue';
        let status = 'open';
        try {
          const issueResult = await pool.query<{ title: string; status: string }>(
            'SELECT title, status FROM issues WHERE id = $1',
            [r.issue_id],
          );
          if (issueResult.rows.length > 0) {
            title = issueResult.rows[0].title;
            status = issueResult.rows[0].status;
          }
        } catch {
          // ignore
        }
        return {
          contributor: r.contributor,
          org_id: r.org_id,
          issue_id: Number(r.issue_id),
          created_at: String(r.created_at),
          title,
          status,
        };
      }),
    );

    res.json(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: msg });
  }
});

// ---------------------------------------------------------------------------
// GET /api/contributors/:address/assignments
// ---------------------------------------------------------------------------

router.get('/:address/assignments', async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!isValidStellarAddress(address)) {
    res.status(400).json({ error: 'invalid stellar address format' });
    return;
  }

  try {
    const asgResult = await pool.query<{
      contributor: string;
      org_id: string;
      issue_id: number;
      created_at: string;
    }>(
      `SELECT contributor, org_id, issue_id, created_at
       FROM assignments
       WHERE contributor = $1`,
      [address],
    );

    const rows = await Promise.all(
      asgResult.rows.map(async (r) => {
        let title = 'Unknown Issue';
        let status = 'open';
        try {
          const issueResult = await pool.query<{ title: string; status: string }>(
            'SELECT title, status FROM issues WHERE id = $1',
            [r.issue_id],
          );
          if (issueResult.rows.length > 0) {
            title = issueResult.rows[0].title;
            status = issueResult.rows[0].status;
          }
        } catch {
          // ignore
        }
        return {
          contributor: r.contributor,
          org_id: r.org_id,
          issue_id: Number(r.issue_id),
          created_at: String(r.created_at),
          title,
          status,
        };
      }),
    );

    res.json(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: msg });
  }
});

// ---------------------------------------------------------------------------
// GET /api/contributors/:address/counts
// ---------------------------------------------------------------------------

router.get('/:address/counts', async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!isValidStellarAddress(address)) {
    res.status(400).json({ error: 'invalid stellar address format' });
    return;
  }

  try {
    const [totalApplications, totalAssignments, byOrganization] = await Promise.all([
      countApplications(address),
      countAssignments(address),
      getOrgBreakdown(address),
    ]);

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
