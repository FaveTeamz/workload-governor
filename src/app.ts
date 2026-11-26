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
import orgsRouter from './routes/orgs';
import createMaintainersRouter from './routes/maintainers';
import { globalLimiter, walletLimiter } from './middleware/rate-limit';
import { apiKeyAuth } from './middleware/api-key-auth';
import { adminAuth } from './middleware/adminAuth';
import { correlationIdMiddleware } from './logger';
import { errorHandler } from './errors';
import { setupSwagger } from './swagger';
import { metricsHandler, metricsMiddleware } from './metrics';

export interface AppOptions {
  /**
   * Rate-limit store for /api/verify-xdr. Inject a fresh MemoryStore in tests
   * to prevent cross-test counter pollution. Defaults to a new MemoryStore.
   */
  verifyXdrStore?: Store;
}

export function createApp(options: AppOptions = {}): express.Application {
  const app = express();
  app.use(metricsMiddleware());

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

  // Protect metrics with METRICS_TOKEN when configured; keep it outside API-key auth.
  app.get('/metrics', metricsHandler);

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
  app.use('/api/admin', adminAuth, adminRouter);
  app.use('/api/api-keys', apiKeysRouter);
  app.use('/api/transactions', walletLimiter, transactionsRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/verify-xdr', verifyXdrRouter);
  app.use('/verify-xdr', verifyXdrRouter);
  app.use('/api/v1/leaderboard', leaderboardRouter);
  app.use('/api/v1/audit', auditRouter);
  app.use('/webhooks', webhooksRouter);
  app.use('/', orgsRouter);
  app.use('/', createMaintainersRouter());

  app.use(errorHandler);

  /** 15 requests per minute per IP, applied only to /api/verify-xdr */
  const verifyXdrLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: options.verifyXdrStore ?? new MemoryStore(),
    message: { error: 'Too many requests, please try again later.' },
  });

  // Rate limit applied first, then a tighter body parser (64 KB cap) for the
  // CPU-intensive XDR verification endpoint.
  app.use('/api/verify-xdr', verifyXdrLimiter);
  app.use('/api/verify-xdr', express.json({ limit: '64kb' }));
  app.use('/api/verify-xdr', xdrRouter);

  return app;
}
