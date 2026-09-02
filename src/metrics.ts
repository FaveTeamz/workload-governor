/**
 * metrics.ts — Prometheus metrics collector and registry
 *
 * Exposes:
 *   GET /metrics — Prometheus text format metrics
 *
 * Metrics:
 *   http_requests_total (counter) — total HTTP requests by method, path, status
 *   http_request_duration_seconds (histogram) — request duration distribution
 *   rpc_calls_total (counter) — total RPC calls by method, status
 *   rpc_call_duration_seconds (histogram) — RPC call duration distribution
 *   cache_hits_total (counter) — cache hits/misses by cache name, result
 *   db_pool_active (gauge) — active database connections
 *   db_pool_idle (gauge) — idle database connections
 *
 * Secured with METRICS_TOKEN environment variable (optional).
 * If METRICS_TOKEN is set, requests must include "Authorization: Bearer <token>" header.
 */

import { register, Counter, Histogram, Gauge } from "prom-client";
import type { Request, Response } from "express";
import { logger } from "./logger";
import { pool } from "./db";

// ─── Configuration ────────────────────────────────────────────────────────────

const DEFAULT_BUCKETS = [0.001, 0.01, 0.1, 0.5, 1, 2, 5, 10];

// ─── Metrics ──────────────────────────────────────────────────────────────────

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests by method, path, and status",
  labelNames: ["method", "path", "status"],
  registers: [register],
});

export const httpRequestDurationSeconds = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "path", "status"],
  buckets: DEFAULT_BUCKETS,
  registers: [register],
});

export const rpcCallsTotal = new Counter({
  name: "rpc_calls_total",
  help: "Total RPC calls by method and status",
  labelNames: ["method", "status"],
  registers: [register],
});

export const rpcCallDurationSeconds = new Histogram({
  name: "rpc_call_duration_seconds",
  help: "RPC call duration in seconds",
  labelNames: ["method"],
  buckets: DEFAULT_BUCKETS,
  registers: [register],
});

export const cacheHitsTotal = new Counter({
  name: "cache_hits_total",
  help: "Cache hits and misses by cache name and result",
  labelNames: ["cache_name", "result"],
  registers: [register],
});

export const dbPoolActive = new Gauge({
  name: "db_pool_active",
  help: "Active database connections",
  registers: [register],
  collect() {
    this.set(pool.totalCount - pool.idleCount);
  },
});

export const dbPoolIdle = new Gauge({
  name: "db_pool_idle",
  help: "Idle database connections",
  registers: [register],
  collect() {
    this.set(pool.idleCount);
  },
});

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Express middleware to record HTTP request metrics.
 * Tracks: total requests, request duration, and response status.
 * 
 * Call this early in the middleware stack so all downstream routes are tracked.
 */
export function metricsMiddleware() {
  return (req: Request, res: Response, next: () => void) => {
    const start = Date.now();
    const originalSend = res.send;

    // Override res.send to capture status code when response is sent
    res.send = function (data: any) {
      const durationSecs = (Date.now() - start) / 1000;
      const status = res.statusCode;
      const method = req.method;
      // Normalize path to avoid cardinality explosion (remove IDs, etc.)
      const path = normalizePath(req.path);

      httpRequestsTotal.labels(method, path, String(status)).inc();
      httpRequestDurationSeconds.labels(method, path, String(status)).observe(durationSecs);

      logger.debug(
        { method, path, status, durationMs: Date.now() - start },
        "HTTP request completed",
      );

      return originalSend.call(this, data);
    };

    next();
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

/**
 * GET /metrics
 * 
 * Returns Prometheus text format metrics.
 * Protected by METRICS_TOKEN environment variable if set.
 */
export async function metricsHandler(req: Request, res: Response): Promise<void> {
  // Check auth token if configured (read from env var at request time)
  const metricsToken = process.env.METRICS_TOKEN;
  if (metricsToken) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");

    if (token !== metricsToken) {
      logger.warn({ token: token ? "provided" : "missing" }, "Metrics endpoint: unauthorized access attempt");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  try {
    const metrics = await register.metrics();
    res.contentType(register.contentType);
    res.send(metrics);
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, "Failed to generate metrics");
    res.status(500).json({ error: "Failed to generate metrics" });
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Normalize request path to avoid cardinality explosion.
 * Replaces numeric IDs and UUIDs with placeholders.
 * 
 * Examples:
 *   /api/users/123 → /api/users/:id
 *   /api/issues/abc-def-123 → /api/issues/:id
 *   /api/metrics → /api/metrics (unchanged)
 */
function normalizePath(path: string): string {
  // Replace numeric IDs
  let normalized = path.replace(/\/\d+(?=\/|$)/g, "/:id");
  // Replace UUIDs (simplified pattern)
  normalized = normalized.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi,
    "/:id",
  );
  return normalized;
}

export default {
  metricsHandler,
  metricsMiddleware,
  register,
};
