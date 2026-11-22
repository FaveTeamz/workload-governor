import express from 'express';
import issuesRouter from './routes/issues';
import contributorsRouter from './routes/contributors';
import adminRouter from './routes/admin';
import transactionsRouter from './routes/transactions';
import auditRouter from './routes/audit';

export function createApp(): express.Application {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/issues', issuesRouter);
  app.use('/api/contributors', contributorsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/transactions', transactionsRouter);
  app.use('/api/v1/audit', auditRouter);

  return app;
}
