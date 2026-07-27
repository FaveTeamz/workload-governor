import { Router } from 'express';
import {
  getIssues,
  getIssueById,
  getIssueStats,
  syncIssues,
} from '../controllers/issueController';
import { authMiddleware } from '../middleware/auth';
import { adminMiddleware } from '../middleware/admin';

const router = Router();

// Public routes (optional authentication)
router.get('/', getIssues);
router.get('/stats', getIssueStats);
router.get('/:id', getIssueById);

// Admin routes
router.post('/sync', authMiddleware, adminMiddleware, syncIssues);

export default router;
