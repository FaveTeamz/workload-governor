import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import issuesRouter from './routes/issues';
import contributorsRouter from './routes/contributors';
import adminRouter from './routes/admin';
import apiKeysRouter from './routes/api-keys';
import transactionsRouter from './routes/transactions';
import webhooksRouter from './routes/webhooks';
import eventsRouter from './routes/events';
import orgsRouter from './routes/orgs';
import { globalLimiter, walletLimiter } from './middleware/rate-limit';
import { apiKeyAuth } from './middleware/api-key-auth';
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
  app.use(apiKeyAuth);

  setupSwagger(app);

  app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));

  // Routes
  app.use('/api/issues', issuesRouter);
  app.use('/api/contributors', contributorsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/api-keys', apiKeysRouter);
  app.use('/api/transactions', walletLimiter, transactionsRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api', orgsRouter);
  app.use('/webhooks', webhooksRouter);

  // Malformed JSON body — Express JSON parser raises SyntaxError with status 400
  app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, next: NextFunction) => {
    if ((err instanceof SyntaxError && (err as Error & { status?: number }).status === 400) || err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'malformed JSON body' });
    }
    next(err);
  });

  app.use(errorHandler);

  return app;
}
