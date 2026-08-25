import { Router } from 'express';
import {
  getCancellations,
  getCancellationStats,
  exportCancellations,
} from '../controllers/auditController';
import { authMiddleware } from '../middleware/auth';
import { adminMiddleware } from '../middleware/admin';

const router = Router();

// All audit routes require authentication
router.use(authMiddleware);

// GET /api/audit/cancellations - Get paginated cancellation records
router.get('/cancellations', getCancellations);

// GET /api/audit/cancellations/stats - Get cancellation statistics
router.get('/cancellations/stats', getCancellationStats);

// GET /api/audit/cancellations/export - Export cancellation data
router.get('/cancellations/export', exportCancellations);

export default router;
