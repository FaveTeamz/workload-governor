/**
 * app.ts — WorkloadGovernor backend Express application factory
 *
 * Exports createApp() so the application can be unit-tested without
 * binding a port.  The server is started at the bottom of this file
 * only when it is the process entry point (require.main === module).
 *
 * Security controls added (#1311):
 *   - app.set('trust proxy', 1)  — trust X-Forwarded-Proto from ALB/Cloudflare
 *   - HTTPS redirect middleware  — 301 to https:// when NODE_ENV=production
 *   - Helmet HSTS                — Strict-Transport-Security: max-age=31536000;
 *                                   includeSubDomains; preload
 */

import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { healthHandler } from "./health.js";
import { startScheduler } from "./scheduler.js";
import { xrayMiddleware } from "./tracing.js";
import logger from "./logger.js";

// ─── Application factory ──────────────────────────────────────────────────────

export function createApp(): express.Application {
  const app = express();

  // ── Reverse-proxy trust (#1311) ───────────────────────────────────────────
  // Trust the first upstream hop (ALB / Cloudflare) so Express reads the real
  // client protocol from X-Forwarded-Proto rather than the VPC-internal TCP
  // connection (which is always HTTP inside the container network).
  app.set("trust proxy", 1);

  // ── HTTPS enforcement middleware (#1311) ──────────────────────────────────
  // In production any request that arrived over plain HTTP must be permanently
  // redirected to the HTTPS equivalent before any other middleware processes
  // it.  The guard is production-only so local development and test runs
  // that use plain HTTP are not broken.
  if (process.env.NODE_ENV === "production") {
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.header("x-forwarded-proto") !== "https") {
        res.redirect(301, `https://${req.header("host")}${req.url}`);
        return;
      }
      next();
    });
  }

  // ── Security headers (#1311) ──────────────────────────────────────────────
  // Helmet sets safe defaults for all headers.  We override hsts to meet the
  // browser preload list requirements: max-age ≥ 1 year, includeSubDomains,
  // preload.  HSTS is applied in every environment so staging also validates
  // the header; the redirect guard above is production-only.
  app.use(
    helmet({
      hsts: {
        maxAge: 31_536_000,       // 1 year in seconds
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  app.use(express.json());

  // Request logger middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug({ method: req.method, path: req.path }, "Incoming request");
    next();
  });

  // Health check
  app.get("/api/health", healthHandler);

  // 404 fallback
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}

// ─── Server startup ───────────────────────────────────────────────────────────
// Only runs when this file is the process entry point, not during tests.

/* istanbul ignore next */
if (require.main === module) {
  const app = createApp();
  const PORT = parseInt(process.env.PORT ?? "3000", 10);

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, "WorkloadGovernor backend listening");
  });

  const scheduler = startScheduler();

  function shutdown(signal: string): void {
    logger.info({ signal }, "Shutdown signal received");
    scheduler.stop();
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10_000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}
