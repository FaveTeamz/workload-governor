import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import issuesRouter from './routes/issues';
import contributorsRouter from './routes/contributors';
import adminRouter from './routes/admin';
import transactionsRouter from './routes/transactions';

export function createApp(): express.Application {
  const app = express();

  // Security middleware
  app.use(helmet());

  // CORS middleware
  const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',');
  app.use(cors({
    origin: corsOrigins,
    credentials: true,
  }));

  // Logging middleware
  app.use(morgan('combined'));

  // JSON parser middleware
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
