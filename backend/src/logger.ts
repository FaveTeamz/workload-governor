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
 */

import pino from "pino";
import pinoHttp from "pino-http";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
    base: { service: "workload-governor" },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Redact sensitive fields that may appear in serialised request objects.
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers[\"x-api-key\"]",
      ],
      censor: "[REDACTED]",
    },
  },
  isDev
    ? pino.transport({ target: "pino-pretty", options: { colorize: true } })
    : pino.destination(1), // stdout
);

/**
 * pino-http middleware — structured HTTP access logs (#1236).
 *
 * Drop-in replacement for morgan. Inherits the pino logger instance above so
 * that request logs and application logs share identical format, timestamp and
 * redaction rules, and can be correlated by request ID.
 *
 * Log level selection:
 *   - 2xx / 3xx → info
 *   - 4xx       → warn
 *   - 5xx       → error  (includes err.stack in log output)
 *
 * Every log line includes:
 *   method, url, statusCode, responseTime (ms), req.remoteAddress,
 *   req.headers["user-agent"]
 */
export const pinoHttpMiddleware = pinoHttp({
  logger,
  // Assign log level by HTTP status code.
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  // Include full error stack on 5xx responses.
  customErrorMessage(_req, res) {
    return `HTTP ${res.statusCode} server error`;
  },
  // Redact sensitive request headers in the serialised req object.
  serializers: {
    req(req) {
      return {
        id:        req.id,
        method:    req.method,
        url:       req.url,
        remoteAddress: req.remoteAddress,
        userAgent: req.headers?.["user-agent"],
        // Redact before serialisation as a belt-and-suspenders measure.
        headers: {
          ...req.headers,
          authorization: req.headers?.authorization  ? "[REDACTED]" : undefined,
          cookie:        req.headers?.cookie          ? "[REDACTED]" : undefined,
          "x-api-key":   req.headers?.["x-api-key"]  ? "[REDACTED]" : undefined,
        },
      };
    },
    res(res) {
      return {
        statusCode:   res.statusCode,
        responseTime: (res as any).responseTime,
      };
    },
  },
});

export default logger;
