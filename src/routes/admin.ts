import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { syncService } from '../sync';

const router = Router();

function authMiddleware(req: Request, res: Response, next: () => void): void {
  const token = req.headers['x-admin-token'];
  if (token !== process.env.ADMIN_TOKEN) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

// POST /api/admin/maintainers  body: { address, org_id }
router.post('/maintainers', authMiddleware, async (req: Request, res: Response) => {
  const { address, org_id } = req.body as { address?: string; org_id?: string };
  if (!address || !org_id) {
    res.status(400).json({ error: 'address and org_id required' });
    return;
  }
  try {
    await pool.query(
      `INSERT INTO maintainers (address, org_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [address, org_id],
    );
    res.status(201).json({ address, org_id });
  } catch {
    res.status(500).json({ error: 'internal server error' });
  }
});

// POST /api/admin/sync  body: { orgs: string[] }
// Trigger manual sync of GitHub issues for specified organizations
router.post('/sync', authMiddleware, async (req: Request, res: Response) => {
  const { orgs } = req.body as { orgs?: string[] };
  if (!orgs || !Array.isArray(orgs) || orgs.length === 0) {
    res.status(400).json({ error: 'orgs array required' });
    return;
  }

  try {
    const results = await syncService.syncAllOrgs(orgs);
    res.json({
      message: 'Sync completed',
      results,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: `Sync failed: ${errorMsg}` });
  }
});

// POST /api/admin/sync/:org  Trigger sync for a single organization
router.post('/sync/:org', authMiddleware, async (req: Request, res: Response) => {
  const { org } = req.params;

  try {
    const result = await syncService.syncIssuesForOrg(org);
    res.json({
      message: 'Sync completed for org',
      result,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: `Sync failed: ${errorMsg}` });
  }
});

export default router;
