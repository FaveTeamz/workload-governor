import { Router, Request, Response } from 'express';
import { getAuditLogs } from '../services/auditService';

const router = Router();

/**
 * GET /api/v1/audit/logs
 *
 * Returns paginated audit log entries.
 * Query params:
 *   event_type  – filter by event type (e.g. "cap_update")
 *   actor       – filter by actor public key
 *   limit       – results per page (1-500, default 50)
 *   offset      – number of records to skip (default 0)
 */
router.get('/logs', async (req: Request, res: Response) => {
  const { event_type, actor, limit, offset } = req.query;

  try {
    const { rows, total } = await getAuditLogs({
      event_type: event_type as string | undefined,
      actor: actor as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    const limitNum = Math.min(Math.max(parseInt((limit as string) ?? '50', 10) || 50, 1), 500);
    const offsetNum = Math.max(parseInt((offset as string) ?? '0', 10) || 0, 0);

    res.json({
      logs: rows,
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < total,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: msg });
  }
});

export default router;
