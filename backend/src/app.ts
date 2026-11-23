/**
 * app.ts — WorkloadGovernor backend service entry point
 *
 * Mounts:
 *   GET /api/health        — health check (#309)
 *
 * Starts:
 *   - Scheduler for TTL extension + GitHub sync (#311, #312)
 *
 * Logging:
 *   - pino-http middleware replaces morgan for structured JSON HTTP access logs
 *     with header redaction and status-code-based log levels (#1236)
 *
 * Tracing:
 *   - AWS X-Ray segment opened per request via xrayMiddleware (#634)
 */

import express from "express";
import { healthHandler } from "./health.js";
import { startScheduler } from "./scheduler.js";
import { xrayMiddleware } from "./tracing.js";
import logger, { pinoHttpMiddleware } from "./logger.js";

// ─── Express app ─────────────────────────────────────────────────────────────

const app = express();

// X-Ray segment middleware — must be first so all downstream handlers inherit
// the active segment context. No-op when XRAY_ENABLED=false.
app.use(xrayMiddleware());

// Structured HTTP access logging via pino-http (#1236).
// Replaces morgan — emits uniform JSON with method, URL, status, responseTime
// and redacted sensitive headers on every request.
app.use(pinoHttpMiddleware);

app.use(express.json());

// Health check
app.get("/api/health", healthHandler);

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, "WorkloadGovernor backend listening");
});

// Start scheduled jobs
const scheduler = startScheduler();

// ─── Graceful shutdown ───────────────────────────────────────────────────────

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

export default app;
