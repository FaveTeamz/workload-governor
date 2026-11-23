/**
 * app.ts — WorkloadGovernor backend service entry point
 *
 * Mounts:
 *   GET /api/health  — health check (#309)
 *   POST/GET /api/maintainers — protected API routes (#1287)
 *
 * Starts:
 *   - Scheduler for TTL extension + GitHub sync (#311, #312)
 *
 * Tracing:
 *   - AWS X-Ray segment opened per request via xrayMiddleware (#634)
 */

import express from "express";
import { healthHandler } from "./health.js";
import { startScheduler } from "./scheduler.js";
import { xrayMiddleware } from "./tracing.js";
import logger from "./logger.js";
import {
  apiKeyAuth,
  registerApiKey,
  revokeApiKey,
  clearApiKeys,
  constantTimeCompare,
  ApiKeyRecord,
  ApiKeyAuthOptions,
} from "./apiKeyAuth.js";

// Export middleware and utilities for external consumers and unit tests
export {
  apiKeyAuth,
  registerApiKey,
  revokeApiKey,
  clearApiKeys,
  constantTimeCompare,
  ApiKeyRecord,
  ApiKeyAuthOptions,
};

// ─── Express app ─────────────────────────────────────────────────────────────

const app = express();

// X-Ray segment middleware — must be first so all downstream handlers inherit
// the active segment context. No-op when XRAY_ENABLED=false.
app.use(xrayMiddleware());

app.use(express.json());

// Request logger middleware
app.use((req, _res, next) => {
  logger.debug({ method: req.method, path: req.path }, "Incoming request");
  next();
});

// Health check (unauthenticated)
app.get("/api/health", healthHandler);

// Protected maintainers / org webhook endpoints using apiKeyAuth
app.get("/api/admin/maintainers", apiKeyAuth, (req, res) => {
  res.status(200).json({
    status: "ok",
    org: (req as any).org,
    scopes: (req as any).apiKeyScopes,
  });
});

app.post("/api/admin/maintainers", apiKeyAuth, (req, res) => {
  res.status(200).json({
    status: "created",
    org: (req as any).org,
    scopes: (req as any).apiKeyScopes,
  });
});

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3000", 10);

let server: any;
let scheduler: any;

const isTestEnv =
  process.env.NODE_ENV === "test" ||
  Boolean(process.env.VITEST) ||
  Boolean(process.env.JEST_WORKER_ID);

if (!isTestEnv) {
  server = app.listen(PORT, () => {
    logger.info({ port: PORT }, "WorkloadGovernor backend listening");
  });

  // Start scheduled jobs
  scheduler = startScheduler();
}

// ─── Graceful shutdown ───────────────────────────────────────────────────────

function shutdown(signal: string): void {
  logger.info({ signal }, "Shutdown signal received");
  if (scheduler) {
    scheduler.stop();
  }
  if (server) {
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
  // Force exit after 10s if server doesn't close cleanly
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
