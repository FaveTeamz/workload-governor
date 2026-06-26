import express from 'express';
import issuesRouter from './routes/issues';
import contributorsRouter from './routes/contributors';
import adminRouter from './routes/admin';
import transactionsRouter from './routes/transactions';
import webhooksRouter from './routes/webhooks';
import { globalLimiter, walletLimiter } from './middleware/rate-limit';

export function createApp(): express.Application {
  const app = express();
  app.use(express.json());

  app.use(globalLimiter);

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/issues', issuesRouter);
  app.use('/api/contributors', contributorsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/transactions', walletLimiter, transactionsRouter);
  app.use('/webhooks', webhooksRouter);

  return app;
}
