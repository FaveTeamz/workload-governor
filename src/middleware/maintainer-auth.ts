import { Request, Response, NextFunction } from 'express';
import { pool } from '../db';
import { AuthenticatedRequest } from './api-key-auth';

export async function maintainerAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const identity = (req as AuthenticatedRequest).apiKeyIdentity;
  if (!identity) {
    res.status(401).json({ error: 'api key required' });
    return;
  }

  const { maintainer, org_id } = req.body as Record<string, unknown>;
  if (
    typeof identity.maintainerAddress !== 'string' ||
    typeof identity.orgId !== 'string' ||
    identity.maintainerAddress !== maintainer ||
    identity.orgId !== org_id
  ) {
    res.status(403).json({ error: 'UnauthorizedMaintainer' });
    return;
  }

  const { rows } = await pool.query(
    'SELECT 1 FROM maintainers WHERE address = $1 AND org_id = $2',
    [maintainer, org_id],
  );
  if (rows.length === 0) {
    res.status(403).json({ error: 'UnauthorizedMaintainer' });
    return;
  }

  next();
}
