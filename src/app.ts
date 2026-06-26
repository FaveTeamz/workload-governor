import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import issuesRouter from './routes/issues';
import contributorsRouter from './routes/contributors';
import adminRouter from './routes/admin';
import transactionsRouter from './routes/transactions';
import webhooksRouter from './routes/webhooks';
import eventsRouter from './routes/events';
import { globalLimiter, walletLimiter } from './middleware/rate-limit';
import { correlationIdMiddleware } from './logger';
import { errorHandler } from './errors';
import { setupSwagger } from './swagger';

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
  app.use(express.static('public'));
  app.use(correlationIdMiddleware);

  // Rate limiting middleware
  app.use(globalLimiter);

  setupSwagger(app);

  app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));

  // Routes
  app.use('/api/issues', issuesRouter);
  app.use('/api/contributors', contributorsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/transactions', walletLimiter, transactionsRouter);
  app.use('/api/events', eventsRouter);
  app.use('/webhooks', webhooksRouter);

  app.use(errorHandler);

  return app;
}
