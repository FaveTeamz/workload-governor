import express, { Request, Response } from 'express';
import { healthCheck } from './db';
import { getRedisClient } from './cache';
import issuesRouter from './routes/issues';
import contributorsRouter from './routes/contributors';
import adminRouter from './routes/admin';
import transactionsRouter from './routes/transactions';

export function createApp(): express.Application {
  const app = express();
  app.use(express.json());

  app.get('/health', async (req: Request, res: Response) => {
    try {
      await healthCheck();
      const redisClient = getRedisClient();
      await redisClient.ping();
      res.json({ status: 'healthy', database: 'connected', cache: 'connected' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      res.status(503).json({ status: 'unhealthy', error: msg });
    }
  });

  app.use('/api/issues', issuesRouter);
  app.use('/api/contributors', contributorsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/transactions', transactionsRouter);

  return app;
}
