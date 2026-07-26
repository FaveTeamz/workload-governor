import { Router, Request, Response } from 'express';

const router = Router();

// GET /contributors/:address/stats
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

export default router;
