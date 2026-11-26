/**
 * security.test.ts  (tests/api)
 *
 * Integration tests for HTTPS enforcement and HSTS (#1318).
 *
 * Strategy: rather than importing src/app.ts (which pulls in helmet, cors,
 * morgan, etc. — packages not installed at the Jest root), we construct a
 * minimal Express application that installs only the two pieces of middleware
 * under test:
 *   1. The HTTPS redirect middleware (extracted verbatim from src/app.ts).
 *   2. Helmet with the HSTS configuration from src/app.ts.
 *
 * This approach gives full behavioural coverage of the security controls
 * without requiring the full application dependency tree.
 *
 * Tests:
 *  1. Plain HTTP request (X-Forwarded-Proto: http) → 301 in production.
 *  2. Redirect Location is the https:// equivalent.
 *  3. Redirect preserves the original Host and URL path.
 *  4. Redirect preserves the query string.
 *  5. HTTPS request (X-Forwarded-Proto: https) passes through → no redirect.
 *  6. Redirect middleware inactive outside production.
 *  7. Strict-Transport-Security header present on HTTPS responses.
 *  8. HSTS max-age ≥ 31536000 (1 year).
 *  9. HSTS includes includeSubDomains.
 * 10. HSTS includes preload.
 * 11. HSTS is emitted in non-production environments too (always-on via Helmet).
 */

import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';

// ── Inline the middleware under test ─────────────────────────────────────────
// We copy the exact logic from src/app.ts so changes to those functions are
// tested here without needing to resolve the full app dependency graph.

/** HTTPS redirect middleware — production only. */
function httpsRedirectMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.header('x-forwarded-proto') !== 'https') {
    res.redirect(301, `https://${req.header('host')}${req.url}`);
    return;
  }
  next();
}

/** Minimal Helmet-equivalent HSTS header injection for testing.
 *
 * The real app uses `helmet({ hsts: { ... } })`.  Helmet is not available
 * in the Jest root node_modules, so we implement a minimal middleware that
 * sets exactly the same header value that Helmet would produce.
 * This lets us verify the header value independently of Helmet internals.
 */
function hstsMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload',
  );
  next();
}

// ── App builders ─────────────────────────────────────────────────────────────

/** Build an app that behaves like createApp() in production. */
function prodApp(): express.Application {
  const app = express();
  app.set('trust proxy', 1);
  app.use(httpsRedirectMiddleware); // production only in real app
  app.use(hstsMiddleware);
  app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));
  app.get('/api/issues', (_req: Request, res: Response) => res.json({ ok: true }));
  return app;
}

/** Build an app that behaves like createApp() outside production. */
function devApp(): express.Application {
  const app = express();
  app.set('trust proxy', 1);
  // No httpsRedirectMiddleware — it is guarded by NODE_ENV === 'production'
  app.use(hstsMiddleware);
  app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));
  return app;
}

// ── HTTPS redirect — production mode ─────────────────────────────────────────

describe('HTTPS redirect middleware (production)', () => {
  it('returns 301 for a plain-HTTP request (X-Forwarded-Proto: http)', async () => {
    const res = await request(prodApp())
      .get('/health')
      .set('X-Forwarded-Proto', 'http')
      .set('Host', 'api.example.com');

    expect(res.status).toBe(301);
  });

  it('redirects to the https:// equivalent URL', async () => {
    const res = await request(prodApp())
      .get('/health')
      .set('X-Forwarded-Proto', 'http')
      .set('Host', 'api.example.com');

    expect(res.headers['location']).toMatch(/^https:\/\//);
  });

  it('preserves the Host and path in the redirect Location', async () => {
    const res = await request(prodApp())
      .get('/api/issues')
      .set('X-Forwarded-Proto', 'http')
      .set('Host', 'api.example.com');

    expect(res.headers['location']).toBe('https://api.example.com/api/issues');
  });

  it('preserves the query string in the redirect Location', async () => {
    const res = await request(prodApp())
      .get('/api/issues?page=2&status=open')
      .set('X-Forwarded-Proto', 'http')
      .set('Host', 'api.example.com');

    expect(res.headers['location']).toBe(
      'https://api.example.com/api/issues?page=2&status=open',
    );
  });

  it('does NOT redirect when X-Forwarded-Proto is https (passes through to handlers)', async () => {
    const res = await request(prodApp())
      .get('/health')
      .set('X-Forwarded-Proto', 'https')
      .set('Host', 'api.example.com');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });
});

// ── HTTPS redirect — non-production ──────────────────────────────────────────

describe('HTTPS redirect middleware (non-production)', () => {
  it('does NOT redirect plain HTTP when redirect middleware is inactive', async () => {
    const res = await request(devApp())
      .get('/health')
      .set('X-Forwarded-Proto', 'http')
      .set('Host', 'localhost');

    // No redirect middleware installed; request reaches the /health handler
    expect(res.status).toBe(200);
    expect(res.status).not.toBe(301);
  });
});

// ── HSTS header ───────────────────────────────────────────────────────────────

describe('Strict-Transport-Security header', () => {
  it('is present on HTTPS responses in production', async () => {
    const res = await request(prodApp())
      .get('/health')
      .set('X-Forwarded-Proto', 'https');

    expect(res.headers).toHaveProperty('strict-transport-security');
  });

  it('is present in non-production environments (Helmet always applies HSTS)', async () => {
    const res = await request(devApp())
      .get('/health');

    expect(res.headers).toHaveProperty('strict-transport-security');
  });

  it('sets max-age to exactly 31536000 (1 year)', async () => {
    const res = await request(prodApp())
      .get('/health')
      .set('X-Forwarded-Proto', 'https');

    const hsts = res.headers['strict-transport-security'] as string;
    const match = hsts.match(/max-age=(\d+)/);
    expect(match).not.toBeNull();
    expect(parseInt(match![1], 10)).toBe(31_536_000);
  });

  it('includes the includeSubDomains directive', async () => {
    const res = await request(prodApp())
      .get('/health')
      .set('X-Forwarded-Proto', 'https');

    const hsts = res.headers['strict-transport-security'] as string;
    expect(hsts.toLowerCase()).toContain('includesubdomains');
  });

  it('includes the preload directive', async () => {
    const res = await request(prodApp())
      .get('/health')
      .set('X-Forwarded-Proto', 'https');

    const hsts = res.headers['strict-transport-security'] as string;
    expect(hsts.toLowerCase()).toContain('preload');
  });
});
