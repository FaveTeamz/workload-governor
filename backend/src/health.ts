/**
 * health.ts — Health check endpoint handler (#309)
 *
 * GET /api/health
 *
 * Response schema:
 *   {
 *     status: "healthy" | "degraded" | "unhealthy",
 *     dependencies: [
 *       { name: string, status: "healthy" | "unhealthy", latency_ms: number }
 *     ]
 *   }
 *
 * HTTP status:
 *   200 — all dependencies healthy
 *   503 — any critical dependency (DB or Soroban RPC) is unhealthy
 *
 * Each check has a 2-second timeout. The handler itself resolves within ~3s.
 */

import type { Request, Response } from "express";
import pool from "./db.js";
import { getLatestLedger } from "./soroban.js";
import logger from "./logger.js";
import Redis from "ioredis";

// ─── Types ────────────────────────────────────────────────────────────────────

type DepStatus = "healthy" | "unhealthy";

interface DependencyResult {
  name:       string;
  status:     DepStatus;
  latency_ms: number;
}

type OverallStatus = "healthy" | "degraded" | "unhealthy";

interface HealthResponse {
  status:       OverallStatus;
  dependencies: DependencyResult[];
}

// ─── Configuration ────────────────────────────────────────────────────────────

const HORIZON_URL  = process.env.HORIZON_URL  ?? "https://horizon-testnet.stellar.org";
const REDIS_URL    = process.env.REDIS_URL    ?? "redis://localhost:6379";
const CHECK_TIMEOUT_MS = 2_000;

// Lazy Redis client — only created once, reused across requests
let redisClient: Redis | undefined;

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(REDIS_URL, {
      connectTimeout: CHECK_TIMEOUT_MS,
      commandTimeout: CHECK_TIMEOUT_MS,
      lazyConnect:    true,
      maxRetriesPerRequest: 0,
    });
  }
  return redisClient;
}

// ─── Individual checks ────────────────────────────────────────────────────────

/**
 * Wrap a check in a 2-second timeout.
 * Returns an unhealthy result with the error message if it times out or throws.
 */
async function withTimeout<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<{ result: T | null; latency_ms: number; error?: string }> {
  const start = Date.now();

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${name} check timed out after ${CHECK_TIMEOUT_MS}ms`)), CHECK_TIMEOUT_MS),
  );

  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    return { result, latency_ms: Date.now() - start };
  } catch (err) {
    return {
      result:     null,
      latency_ms: Date.now() - start,
      error:      err instanceof Error ? err.message : String(err),
    };
  }
}

/** Check PostgreSQL by running SELECT 1. */
async function checkDatabase(): Promise<DependencyResult> {
  const { result, latency_ms, error } = await withTimeout("postgres", async () => {
    const res = await pool.query("SELECT 1");
    return res.rowCount === 1;
  });

  if (result && !error) {
    return { name: "postgres", status: "healthy", latency_ms };
  }
  logger.warn({ error }, "Health check: postgres unhealthy");
  return { name: "postgres", status: "unhealthy", latency_ms };
}

/** Check Redis by sending PING. */
async function checkRedis(): Promise<DependencyResult> {
  const { result, latency_ms, error } = await withTimeout("redis", async () => {
    const client = getRedisClient();
    await client.connect().catch(() => {/* already connected */});
    const pong = await client.ping();
    return pong === "PONG";
  });

  if (result && !error) {
    return { name: "redis", status: "healthy", latency_ms };
  }
  logger.warn({ error }, "Health check: redis unhealthy");
  return { name: "redis", status: "unhealthy", latency_ms };
}

/** Check Soroban RPC by calling getLatestLedger. */
async function checkSorobanRpc(): Promise<DependencyResult> {
  const { result, latency_ms, error } = await withTimeout("soroban_rpc", async () => {
    const seq = await getLatestLedger();
    return seq > 0;
  });

  if (result && !error) {
    return { name: "soroban_rpc", status: "healthy", latency_ms };
  }
  logger.warn({ error }, "Health check: soroban_rpc unhealthy");
  return { name: "soroban_rpc", status: "unhealthy", latency_ms };
}

/** Check Horizon by fetching /fee_stats. */
async function checkHorizon(): Promise<DependencyResult> {
  const { result, latency_ms, error } = await withTimeout("horizon", async () => {
    const res = await fetch(`${HORIZON_URL}/fee_stats`);
    return res.ok;
  });

  if (result && !error) {
    return { name: "horizon", status: "healthy", latency_ms };
  }
  logger.warn({ error }, "Health check: horizon unhealthy");
  return { name: "horizon", status: "unhealthy", latency_ms };
}

/** Check the GitHub API by fetching the rate_limit endpoint (no quota cost). */
async function checkGitHub(): Promise<DependencyResult> {
  const { result, latency_ms, error } = await withTimeout("github", async () => {
    const headers: Record<string, string> = {
      Accept:                  "application/vnd.github+json",
      "X-GitHub-Api-Version":  "2022-11-28",
    };
    const token = process.env.GITHUB_TOKEN;
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch("https://api.github.com/rate_limit", { headers });
    return res.ok;
  });

  if (result && !error) {
    return { name: "github", status: "healthy", latency_ms };
  }
  logger.warn({ error }, "Health check: github unhealthy");
  return { name: "github", status: "unhealthy", latency_ms };
}

// ─── Critical dependency names (503 if any is unhealthy) ─────────────────────

const CRITICAL_DEPS = new Set(["postgres", "soroban_rpc"]);

// ─── Route handler ────────────────────────────────────────────────────────────

/**
 * GET /api/health
 *
 * All dependency checks run concurrently. Individual failures are caught and
 * converted to unhealthy results — they never propagate to the caller.
 */
export async function healthHandler(_req: Request, res: Response): Promise<void> {
  const start = Date.now();

  const [postgres, redis, sorobanRpc, horizon, github] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkSorobanRpc(),
    checkHorizon(),
    checkGitHub(),
  ]);

  const dependencies: DependencyResult[] = [postgres, redis, sorobanRpc, horizon, github];

  const criticalDown = dependencies.some(
    (d) => CRITICAL_DEPS.has(d.name) && d.status === "unhealthy",
  );
  const anyDown = dependencies.some((d) => d.status === "unhealthy");

  const overallStatus: OverallStatus = criticalDown
    ? "unhealthy"
    : anyDown
    ? "degraded"
    : "healthy";

  const body: HealthResponse = { status: overallStatus, dependencies };
  const httpStatus = criticalDown ? 503 : 200;

  logger.info(
    { status: overallStatus, durationMs: Date.now() - start },
    "Health check complete",
  );

  res.status(httpStatus).json(body);
}
