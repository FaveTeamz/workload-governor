import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import http from 'http';

import { migrate, closePool } from './db';
import { closeRedis } from './services/redis';
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
  app.use('/contributors', contributorsRouter);

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

// ---------------------------------------------------------------------------
// Graceful shutdown helpers
// ---------------------------------------------------------------------------

/** Track active in-flight connections so we can drain before exit. */
let activeConnections = 0;
let server: http.Server | null = null;
let isShuttingDown = false;

/** Configurable drain timeout — default 30 s, overridable via env. */
const DRAIN_TIMEOUT_MS = parseInt(process.env['DRAIN_TIMEOUT_MS'] ?? '30000', 10);

/** 
 * Start failing the readiness probe immediately.
 * This signals Kubernetes to stop sending new traffic to this pod.
 */
export function isReady(): boolean {
  return !isShuttingDown;
}

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal, activeConnections }, 'Shutdown signal received – draining in-flight requests');

  // 1. Stop accepting new connections
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed – no new connections accepted');
    });
  }

  // 2. Wait for in-flight requests to finish, with a hard timeout
  await new Promise<void>((resolve) => {
    if (activeConnections <= 0) {
      resolve();
      return;
    }

    logger.info({ activeConnections, timeoutMs: DRAIN_TIMEOUT_MS }, 'Waiting for in-flight requests to complete');

    const timer = setTimeout(() => {
      logger.warn({ activeConnections }, 'Drain timeout reached – forcing shutdown');
      resolve();
    }, DRAIN_TIMEOUT_MS);

    // Poll until connections drain or timeout fires
    const poll = setInterval(() => {
      if (activeConnections <= 0) {
        clearInterval(poll);
        clearTimeout(timer);
        resolve();
      }
    }, 100);
  });

  // 3. Close external connections (DB, Redis)
  try {
    await closePool();
    logger.info('Database pool closed');
  } catch (err) {
    logger.error({ err }, 'Error closing database pool');
  }

  try {
    await closeRedis();
    logger.info('Redis connection closed');
  } catch (err) {
    logger.error({ err }, 'Error closing Redis connection');
  }

  logger.info('Graceful shutdown complete');
  process.exit(0);
}

// Only start the server when run directly (not when imported by tests)
if (require.main === module) {
  const PORT = parseInt(process.env['PORT'] ?? '3001', 10);

  // Track new / closed connections
  process.on('connection', (socket) => {
    activeConnections++;
    socket.on('close', () => {
        activeConnections--;
      });
  });

  // Listen for termination signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  migrate()
    .then(() => {
      server = app.listen(PORT, () => {
        logger.info({ port: PORT }, 'Server listening');
      });
    })
    .catch((err) => {
      logger.error({ err }, 'Failed to run DB migrations');
      process.exit(1);
    });
}
