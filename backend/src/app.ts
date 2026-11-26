/**
 * app.ts — WorkloadGovernor backend service entry point
 *
 * Mounts:
 *   GET /api/health  — health check (#309)
 *
 * Starts:
 *   - Scheduler for TTL extension + GitHub sync (#311, #312)
 *
 * Tracing:
 *   - AWS X-Ray segment opened per request via xrayMiddleware (#634)
 *
 * Security:
 *   - CSP, X-Frame-Options and X-Content-Type-Options on every response (#1314)
 */

import express from "express";
import helmet from "helmet";
import { healthHandler } from "./health.js";
import { startScheduler } from "./scheduler.js";
import { correlationMiddleware, xrayMiddleware } from "./tracing.js";
import logger, { pinoHttpMiddleware } from "./logger.js";
import { adminAuth } from "./middleware/adminAuth.js";
import adminRouter from "./routes/admin.js";
import { sseHandler } from "./routes/events.js";
import { rateLimiterMiddleware, rateLimitHeadersMiddleware } from "./services/rateLimiter.js";

export {
  apiKeyAuth, registerApiKey, revokeApiKey, clearApiKeys, constantTimeCompare,
  type ApiKeyRecord, type ApiKeyAuthOptions,
} from "./apiKeyAuth.js";

// ─── Express app ─────────────────────────────────────────────────────────────

export function createApp(): express.Application {
  const app = express();
  app.set("trust proxy", 1);

  // X-Ray segment middleware — must be first so all downstream handlers inherit
  // the active segment context. No-op when XRAY_ENABLED=false.
  app.use(correlationMiddleware());
  app.use(xrayMiddleware());
  app.use(pinoHttpMiddleware);

  // Security response headers — applied before every route so health checks,
  // API responses and 404s are all covered (#1314).
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https://avatars.githubusercontent.com"],
        connectSrc: ["'self'", "https://horizon-testnet.stellar.org", "https://horizon.stellar.org"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xContentTypeOptions: true,
    xFrameOptions: { action: "deny" },
  }));

  if (process.env.NODE_ENV === "production") {
    app.use((req, res, next) => {
      if (req.secure) {
        next();
        return;
      }
      const host = req.get("host");
      if (!host || !/^(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::[0-9]+)?$/i.test(host)) {
        res.status(400).json({ error: "Invalid Host header" });
        return;
      }
      logger.warn({ "x-forwarded-proto": "http", path: req.path }, "Redirecting plaintext request");
      res.redirect(301, `https://${host}${req.originalUrl}`);
    });
  }

  app.use(rateLimitHeadersMiddleware);
  app.use(express.json());
  app.use(rateLimiterMiddleware);
  app.get("/api/health", healthHandler);
  app.get("/api/events/stream", sseHandler);
  app.use("/api/admin", adminAuth, adminRouter);

  // 404 fallback
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}

const app = createApp();

// ─── Start ───────────────────────────────────────────────────────────────────

if (require.main === module) {
  const PORT = parseInt(process.env.PORT ?? "3000", 10);

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, "WorkloadGovernor backend listening");
  });

  // Start scheduled jobs
  const scheduler = startScheduler();

  // ─── Graceful shutdown ─────────────────────────────────────────────────────

  function shutdown(signal: string): void {
    logger.info({ signal }, "Shutdown signal received");
    scheduler.stop();
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
    // Force exit after 10s if server doesn't close cleanly
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10_000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

export default app;
