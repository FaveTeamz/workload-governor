import { Router, Request, Response } from 'express';
import {
  getCancellations,
  getCancellationStats,
  exportCancellations,
} from '../controllers/auditController';
import { authMiddleware } from '../middleware/auth';
import { adminMiddleware } from '../middleware/admin';
import { db } from '../config/database';

const router = Router();

// All audit routes require authentication
router.use(authMiddleware);

// GET /api/audit - Paginated audit log entries (maintainer-only)
router.get('/', adminMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = req.query.org_id as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string || '50', 10)));
    const offset = (page - 1) * pageSize;

    let query = db('audit_log').select('*');
    if (orgId) {
      query = query.where('org_id', orgId);
    }

    const countResult = await query.clone().count('* as total').first();
    const total = parseInt((countResult as any)?.total || '0', 10);

    const data = await query
      .orderBy('timestamp', 'desc')
      .limit(pageSize)
      .offset(offset);

    res.json({
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'internal server error';
    res.status(500).json({ error: msg });
  }
});

// GET /api/audit/cancellations - Get paginated cancellation records
router.get('/cancellations', getCancellations);

// GET /api/audit/cancellations/stats - Get cancellation statistics
router.get('/cancellations/stats', getCancellationStats);

// GET /api/audit/cancellations/export - Export cancellation data
router.get('/cancellations/export', exportCancellations);

export default router;
