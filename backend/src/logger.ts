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

export const REDACT_PATHS = [
  "req.headers.authorization",
  'req.headers["x-api-key"]',
  "req.headers.cookie",
  "secretKey",
  "privateKey",
  "apiKey",
  "token",
  "email",
  "password",
  "*.secretKey",
  "*.privateKey",
  "*.apiKey",
  "*.token",
  "*.email",
  "*.password",
];

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
    base: { service: "workload-governor" },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: REDACT_PATHS,
