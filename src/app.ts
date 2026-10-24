import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { logger } from './logger';
import issuesRouter from './routes/issues';
import contributorsRouter from './routes/contributors';
import adminRouter from './routes/admin';
import apiKeysRouter from './routes/api-keys';
import transactionsRouter from './routes/transactions';
import webhooksRouter from './routes/webhooks';
import adminWebhooksRouter from './routes/admin-webhooks';
import eventsRouter from './routes/events';
import leaderboardRouter from './routes/leaderboard';
import auditRouter from './routes/auditRoutes';
import verifyXdrRouter from './routes/verify-xdr';
import { globalLimiter, walletLimiter } from './middleware/rate-limit';
import { apiKeyAuth } from './middleware/api-key-auth';
import { correlationIdMiddleware } from './logger';
import { errorHandler } from './errors';
import { setupSwagger } from './swagger';

export function createApp(): express.Application {
  const app = express();

  // Enforce HTTPS-only transport and HSTS headers in production environment
  if (process.env.NODE_ENV === 'production') {
    app.use((req: Request, res: Response, next) => {
      const proto = req.headers['x-forwarded-proto'];
      if (proto && proto !== 'https') {
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
      }
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      next();
    });
  }

  const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',');

  // Security middleware — strict CSP, HSTS with preload, deny framing (issue #1098)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'https:', ...corsOrigins],
        formAction: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));

  // CORS middleware
  app.use(cors({
    origin: corsOrigins,
    credentials: true,
  }));

  app.use(correlationIdMiddleware);

  // Structured HTTP access logs share the application logger and request ID.
  app.use(pinoHttp({
    logger,
    genReqId: (req) => (req as Request).correlationId,
  }));

  // JSON parser middleware
  app.use(express.json());
  app.use(express.static('public'));

  // Rate limiting middleware
  app.use(globalLimiter);
  app.use('/api/admin/webhooks', adminWebhooksRouter);
  app.use(apiKeyAuth);

  setupSwagger(app);

  app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));

  // Routes
  app.use('/api/issues', issuesRouter);
  app.use('/api/contributors', contributorsRouter);
  app.use('/api/v1/contributors', contributorsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/api-keys', apiKeysRouter);
  app.use('/api/transactions', walletLimiter, transactionsRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/verify-xdr', verifyXdrRouter);
  app.use('/verify-xdr', verifyXdrRouter);
  app.use('/api/v1/leaderboard', leaderboardRouter);
  app.use('/api/v1/audit', auditRouter);
  app.use('/webhooks', webhooksRouter);

  app.use(errorHandler);

  return app;
}
