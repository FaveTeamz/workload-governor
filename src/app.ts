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

  // ── Reverse-proxy trust (#1318) ─────────────────────────────────────────
  // Trust the first hop (ALB / Cloudflare) so that req.protocol and
  // req.header('x-forwarded-proto') reflect the original client protocol.
  app.set('trust proxy', 1);

  // ── HTTPS enforcement (#1318) ────────────────────────────────────────────
  // In production, any request that arrived over plain HTTP must be
  // permanently redirected to the HTTPS equivalent.  The ALB / CDN sets
  // X-Forwarded-Proto before forwarding to the container.
  if (process.env.NODE_ENV === 'production') {
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.header('x-forwarded-proto') !== 'https') {
        return res.redirect(301, `https://${req.header('host')}${req.url}`);
      }
      next();
    });
  }

  // ── Security headers (#1318) ─────────────────────────────────────────────
  // helmet() sets safe defaults for all headers.  We override hsts to match
  // the browser preload list requirements: max-age ≥ 1 year, includeSubDomains,
  // preload.  HSTS is applied in all environments so staging also validates the
  // header; the redirect guard above is production-only because staging traffic
  // may legitimately arrive over HTTP from internal tooling.
  app.use(
    helmet({
      hsts: {
        maxAge: 31_536_000,      // 1 year in seconds
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

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
