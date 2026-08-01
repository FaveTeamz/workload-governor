/**
 * logger.ts — Structured JSON logger (pino)
 *
 * In production NODE_ENV the transport is the raw JSON stream.
 * In development it uses pino-pretty for human-readable output.
 *
 * Log level is fully configurable via the LOG_LEVEL environment variable.
 * Valid values: error | warn | info | debug | trace  (default: info in production, debug in dev)
 */

import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
    base: { service: "workload-governor" },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  isDev
    ? pino.transport({ target: "pino-pretty", options: { colorize: true } })
    : pino.destination(1), // stdout
);

export default logger;
