import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';

import { migrate } from './db';
import healthRouter from './routes/health';
import orgsRouter from './routes/orgs';
import contributorsRouter from './routes/contributors';

const logger = pino({
  name: 'workload-governor-api',
  // Silence logs in test environment to keep test output clean
  level: process.env['NODE_ENV'] === 'test' ? 'silent' : 'info',
});

export function createApp(): express.Application {
  const app = express();

  // Security & parsing middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  if (process.env['NODE_ENV'] !== 'test') {
    app.use(pinoHttp({ logger }));
  }

  // Routes
  app.use('/', healthRouter);
  app.use('/', orgsRouter);
  app.use('/', contributorsRouter);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'not_found', message: 'Route not found' });
  });

  // Global error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'Unhandled error');
    res.status(500).json({ error: 'internal_error', message: err.message });
  });

  return app;
}

// Named export for tests (used by supertest in tests/routes/*.test.ts)
export const app = createApp();

// Only start the server when run directly (not when imported by tests)
if (require.main === module) {
  const PORT = parseInt(process.env['PORT'] ?? '3001', 10);

  migrate()
    .then(() => {
      app.listen(PORT, () => {
        logger.info({ port: PORT }, 'Server listening');
      });
    })
    .catch((err) => {
      logger.error({ err }, 'Failed to run DB migrations');
      process.exit(1);
    });
}
