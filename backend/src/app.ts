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
 *
 * Security:
 *   - CSP, X-Frame-Options and X-Content-Type-Options on every response (#1314)
 */

import express from "express";
import helmet from "helmet";
import { healthHandler } from "./health.js";
import { startScheduler } from "./scheduler.js";
import { xrayMiddleware } from "./tracing.js";
import { adminAuth } from "./middleware/adminAuth.js";
import adminRouter from "./routes/admin.js";
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
