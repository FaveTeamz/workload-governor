/**
 * app.ts — WorkloadGovernor backend service entry point
 *
 * Mounts:
 *   GET /api/health  — health check (#309)
 *
 * Starts:
 *   - Scheduler for TTL extension + GitHub sync (#311, #312)
 */

import express from "express";
import { healthHandler } from "./health.js";
import { startScheduler } from "./scheduler.js";
import logger from "./logger.js";

// ─── Express app ─────────────────────────────────────────────────────────────

const app = express();

app.use(express.json());

// Request logger middleware
app.use((req, _res, next) => {
  logger.debug({ method: req.method, path: req.path }, "Incoming request");
  next();
});

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
