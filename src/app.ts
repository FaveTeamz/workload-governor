import express from 'express';
import { rateLimit, MemoryStore, Store } from 'express-rate-limit';
import issuesRouter from './routes/issues';
import contributorsRouter from './routes/contributors';
import adminRouter from './routes/admin';
import transactionsRouter from './routes/transactions';
import xdrRouter from './routes/xdr';

export interface AppOptions {
  /**
   * Rate-limit store for /api/verify-xdr. Inject a fresh MemoryStore in tests
   * to prevent cross-test counter pollution. Defaults to a new MemoryStore.
   */
  verifyXdrStore?: Store;
}

export function createApp(options: AppOptions = {}): express.Application {
  const app = express();

  // Trust proxy headers so express-rate-limit sees the real client IP when
  // running behind a load balancer.
  app.set('trust proxy', 1);

  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/issues', issuesRouter);
  app.use('/api/contributors', contributorsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/transactions', transactionsRouter);

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
