/**
 * apiKeyAuth.ts — API Key Authentication & Scope Enforcement Middleware
 *
 * Implements authentication for external organization maintainers and
 * automated webhook publishers (#1287).
 *
 * Features:
 *   - Extracts key from `X-API-Key`, `Authorization: Bearer <token>`, or `x-admin-token`
 *   - Constant-time comparison via crypto.timingSafeEqual against timing attacks
 *   - Edge-case validation: missing headers, malformed Bearer schemes, non-ASCII keys, expired keys
 *   - Revocation status check (403 Forbidden)
 *   - Scope enforcement: read-only keys rejected on mutation methods (POST, PUT, PATCH, DELETE)
 *   - Populates `req.org`, `req.apiKeyScopes`, and rate limit tagging
 */

import crypto from "crypto";
import { Request, Response, NextFunction } from "express";

export interface ApiKeyRecord {
  id?: string;
  key: string;
  org: string;
  scopes: string[];
  revoked?: boolean;
  expiresAt?: Date | number;
}

export interface ApiKeyAuthOptions {
  keys?: ApiKeyRecord[];
  requireWriteForMutations?: boolean;
}

// In-memory registry for registered API keys
const apiKeyRegistry: Map<string, ApiKeyRecord> = new Map();

/**
 * Register an API key in the registry.
 */
export function registerApiKey(record: ApiKeyRecord): void {
  apiKeyRegistry.set(record.key, { ...record });
}

/**
 * Revoke an API key.
 */
export function revokeApiKey(key: string): void {
  const existing = apiKeyRegistry.get(key);
  if (existing) {
    existing.revoked = true;
  } else {
    apiKeyRegistry.set(key, { key, org: "unknown", scopes: [], revoked: true });
  }
}

/**
 * Clear all API keys from the registry.
 */
export function clearApiKeys(): void {
  apiKeyRegistry.clear();
}

/**
 * Compare two strings in constant time to prevent timing attacks.
 * Uses SHA-256 digests so both buffers are always 32 bytes.
 */
export function constantTimeCompare(a: string, b: string): boolean {
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Extract API key token from request headers.
 */
function extractToken(req: Request): { token?: string; error?: string } {
  const xApiKey = req.headers["x-api-key"];
  const authHeader = req.headers["authorization"];
  const xAdminToken = req.headers["x-admin-token"];

  // 1. Check X-API-Key header
  if (xApiKey !== undefined) {
    const raw = Array.isArray(xApiKey) ? xApiKey[0] : xApiKey;
    if (typeof raw !== "string" || raw.trim().length === 0) {
      return { error: "API key header is empty" };
    }
    return { token: raw.trim() };
  }

  // 2. Check Authorization header
  if (authHeader !== undefined) {
    const rawAuth = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (typeof rawAuth !== "string" || rawAuth.trim().length === 0) {
      return { error: "Authorization header is empty" };
    }

    const trimmed = rawAuth.trim();
    const bearerMatch = /^Bearer(\s+(.+))?$/i.exec(trimmed);
    if (!bearerMatch) {
      return { error: "Malformed authorization scheme: expected Bearer" };
    }

    const tokenPart = bearerMatch[2]?.trim();
    if (!tokenPart || tokenPart.length === 0) {
      return { error: "Bearer token missing or malformed" };
    }

    return { token: tokenPart };
  }

  // 3. Check x-admin-token header fallback
  if (xAdminToken !== undefined) {
    const raw = Array.isArray(xAdminToken) ? xAdminToken[0] : xAdminToken;
    if (typeof raw !== "string" || raw.trim().length === 0) {
      return { error: "Admin token header is empty" };
    }
    return { token: raw.trim() };
  }

  return { error: "Missing API key or Authorization header" };
}

/**
 * Find matching key record from the registry or options.
 */
function findKeyRecord(token: string, optionsKeys?: ApiKeyRecord[]): ApiKeyRecord | undefined {
  // Check optionsKeys if supplied
  if (optionsKeys) {
    for (const record of optionsKeys) {
      if (constantTimeCompare(token, record.key)) {
        return record;
      }
    }
    return undefined;
  }

  // Check process.env.ADMIN_TOKEN
  const envAdminToken = process.env.ADMIN_TOKEN;
  if (envAdminToken && constantTimeCompare(token, envAdminToken)) {
    return {
      key: envAdminToken,
      org: "admin",
      scopes: ["read", "write", "admin"],
      revoked: false,
    };
  }

  // Check registry
  for (const record of apiKeyRegistry.values()) {
    if (constantTimeCompare(token, record.key)) {
      return record;
    }
  }

  return undefined;
}

/**
 * Handle authentication and authorization.
 */
function handleApiKeyAuth(options?: ApiKeyAuthOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { token, error } = extractToken(req);

    if (error || !token) {
      res.status(401).json({
        error: "Unauthorized",
        message: error,
        status: 401,
      });
      return;
    }

    // Validate ASCII token encoding
    const isAscii = /^[\x20-\x7E]+$/.test(token);
    if (!isAscii) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Malformed API key format: non-ASCII characters detected",
        status: 401,
      });
      return;
    }

    // Match key
    const record = findKeyRecord(token, options?.keys);
    if (!record) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Invalid API key",
        status: 401,
      });
      return;
    }

    // Check revocation
    if (record.revoked) {
      res.status(403).json({
        error: "Forbidden",
        message: "API key has been revoked",
        status: 403,
      });
      return;
    }

    // Check expiration
    if (record.expiresAt) {
      const expTime = new Date(record.expiresAt).getTime();
      if (expTime < Date.now()) {
        res.status(401).json({
          error: "Unauthorized",
          message: "API key has expired",
          status: 401,
        });
        return;
      }
    }

    // Scope enforcement on mutation methods
    const mutationMethods = ["POST", "PUT", "PATCH", "DELETE"];
    const isMutation = mutationMethods.includes(req.method.toUpperCase());
    const requireWrite = options?.requireWriteForMutations ?? true;

    if (isMutation && requireWrite) {
      const hasWriteScope = record.scopes.some((scope) =>
        ["write", "admin", "*"].includes(scope.toLowerCase()),
      );

      if (!hasWriteScope) {
        res.status(403).json({
          error: "Forbidden",
          message: "Insufficient scope: read-only API key cannot perform mutation operations",
          status: 403,
        });
        return;
      }
    }

    // Populate request context
    (req as any).org = record.org;
    (req as any).apiKeyScopes = record.scopes;
    (req as any).apiKeyRecord = record;
    (req as any).rateLimitKey = `${record.org}:${record.id ?? record.key.slice(0, 8)}`;

    next();
  };
}

/**
 * Express middleware for API key authentication.
 * Can be used as `app.use(apiKeyAuth)` or `app.use(apiKeyAuth(options))`.
 */
export function apiKeyAuth(
  reqOrOptions?: Request | ApiKeyAuthOptions,
  res?: Response,
  next?: NextFunction,
): any {
  // Direct middleware signature: apiKeyAuth(req, res, next)
  if (
    reqOrOptions &&
    typeof reqOrOptions === "object" &&
    "headers" in reqOrOptions &&
    res &&
    typeof next === "function"
  ) {
    return handleApiKeyAuth()(reqOrOptions as Request, res, next);
  }

  // Middleware factory signature: apiKeyAuth(options)
  return handleApiKeyAuth(reqOrOptions as ApiKeyAuthOptions);
}
