/**
 * logger.ts — Structured JSON logger (pino) with HTTP middleware (#1236)
 *
 * In production NODE_ENV the transport is the raw JSON stream.
 * In development it uses pino-pretty for human-readable output.
 *
 * Also exports pinoHttpMiddleware, a configured pino-http instance that:
 *   - Emits structured JSON for every HTTP request (replaces morgan, #1236)
 *   - Redacts sensitive request headers (authorization, cookie, x-api-key)
 *   - Records response latency as responseTime on every request
 *   - Logs info for 2xx/3xx, warn for 4xx, and error (with stack) for 5xx
 *
 * Correlation ID injection (#1234):
 *   - Every log line emitted during a request includes reqId read from
 *     AsyncLocalStorage (set by correlationMiddleware in tracing.ts).
 */

import pino from "pino";
import pinoHttp from "pino-http";
import { getRequestId } from "./tracing.js";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
    base: { service: "workload-governor" },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Inject reqId from AsyncLocalStorage into every log record (#1234).
    // Returns undefined outside a request context (e.g. scheduler), which pino
    // omits from the output rather than writing reqId: undefined.
    mixin() {
      const reqId = getRequestId();
      return reqId ? { reqId } : {};
    },
  },
  isDev
    ? pino.transport({ target: "pino-pretty", options: { colorize: true } })
    : pino.destination(1), // stdout
);

export default logger;
