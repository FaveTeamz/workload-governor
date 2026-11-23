/**
 * apiKeyAuth.test.ts — Unit tests for API key authentication middleware (#1287)
 *
 * Verifies edge cases:
 *  1. Valid API key succeeds and populates req.org and req.apiKeyScopes.
 *  2. Missing X-API-Key, Authorization: Bearer, or x-admin-token returns 401 Unauthorized.
 *  3. Invalid format (Bearer with no token, empty strings, whitespace, non-ASCII keys) returns 401.
 *  4. Revoked API key returns 403 Forbidden.
 *  5. Constant-time comparison ensures timing attacks are mitigated.
 *  6. Key with read-only scope blocked from POST/mutation routes.
 *
 * Acceptance Criteria:
 *  - 100% branch and statement coverage on apiKeyAuth middleware.
 *  - Tests verify all HTTP 401 and 403 rejection scenarios.
 *  - Timing attack constant-time comparison verified.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import crypto from "crypto";
import {
  apiKeyAuth,
  registerApiKey,
  revokeApiKey,
  clearApiKeys,
  constantTimeCompare,
  ApiKeyRecord,
} from "../apiKeyAuth.js";

// Helper to build a clean test Express app mounted with apiKeyAuth
function createTestApp() {
  const app = express();
  app.use(express.json());

  // Protected maintainers / org webhook endpoints using apiKeyAuth
  app.get("/api/admin/maintainers", apiKeyAuth, (req, res) => {
    res.status(200).json({
      status: "ok",
      org: (req as any).org,
      scopes: (req as any).apiKeyScopes,
    });
  });

  app.post("/api/admin/maintainers", apiKeyAuth, (req, res) => {
    res.status(200).json({
      status: "created",
      org: (req as any).org,
      scopes: (req as any).apiKeyScopes,
    });
  });

  return app;
}

describe("apiKeyAuth Middleware Edge Cases (#1287)", () => {
  let app: express.Express;
  const originalEnvAdminToken = process.env.ADMIN_TOKEN;

  beforeEach(() => {
    clearApiKeys();
    delete process.env.ADMIN_TOKEN;
    app = createTestApp();
  });

  afterEach(() => {
    if (originalEnvAdminToken !== undefined) {
      process.env.ADMIN_TOKEN = originalEnvAdminToken;
    } else {
      delete process.env.ADMIN_TOKEN;
    }
    vi.restoreAllMocks();
  });

  // ─── 1. Successful Authentication & Context Population ───────────────────────

  describe("1. Valid API key authentication & context population", () => {
    it("authenticates via X-API-Key and populates req.org and req.apiKeyScopes", async () => {
      registerApiKey({
        id: "key-1",
        key: "valid-secret-key-12345",
        org: "stellar-songifi",
        scopes: ["read", "write"],
      });

      const res = await request(app)
        .get("/api/admin/maintainers")
        .set("X-API-Key", "valid-secret-key-12345");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: "ok",
        org: "stellar-songifi",
        scopes: ["read", "write"],
      });
    });

    it("authenticates via Authorization: Bearer <token>", async () => {
      registerApiKey({
        key: "bearer-secret-token-xyz",
        org: "stellar-org",
        scopes: ["read", "write"],
      });

      const res = await request(app)
        .get("/api/admin/maintainers")
        .set("Authorization", "Bearer bearer-secret-token-xyz");

      expect(res.status).toBe(200);
      expect(res.body.org).toBe("stellar-org");
      expect(res.body.scopes).toEqual(["read", "write"]);
    });

    it("authenticates case-insensitively with bearer scheme", async () => {
      registerApiKey({
        key: "case-bearer-token",
        org: "case-org",
        scopes: ["read", "write"],
      });

      const res = await request(app)
        .get("/api/admin/maintainers")
        .set("Authorization", "bearer case-bearer-token");

      expect(res.status).toBe(200);
      expect(res.body.org).toBe("case-org");
    });

    it("authenticates via x-admin-token fallback header", async () => {
      registerApiKey({
        key: "admin-token-secret-999",
        org: "admin-org",
        scopes: ["admin"],
      });

      const res = await request(app)
        .get("/api/admin/maintainers")
        .set("x-admin-token", "admin-token-secret-999");

      expect(res.status).toBe(200);
      expect(res.body.org).toBe("admin-org");
    });

    it("falls back to process.env.ADMIN_TOKEN when set", async () => {
      process.env.ADMIN_TOKEN = "env-admin-super-secret";

      const res = await request(app)
        .get("/api/admin/maintainers")
        .set("X-API-Key", "env-admin-super-secret");

      expect(res.status).toBe(200);
      expect(res.body.org).toBe("admin");
      expect(res.body.scopes).toContain("admin");
    });

    it("tags rateLimitKey on the request", async () => {
      registerApiKey({
        id: "key-uuid-1",
        key: "rate-limit-key-test",
        org: "org-rate-limit",
        scopes: ["read"],
      });

      let capturedReq: any;
      const testApp = express();
      testApp.use(apiKeyAuth);
      testApp.get("/test", (req, res) => {
        capturedReq = req;
        res.json({ ok: true });
      });

      const res = await request(testApp)
        .get("/test")
        .set("X-API-Key", "rate-limit-key-test");

      expect(res.status).toBe(200);
      expect(capturedReq.rateLimitKey).toBe("org-rate-limit:key-uuid-1");
      expect(capturedReq.apiKeyRecord).toBeDefined();
    });

    it("tags rateLimitKey with key prefix when id is omitted", async () => {
      registerApiKey({
        key: "long-key-without-explicit-id",
        org: "org-no-id",
        scopes: ["read"],
      });

      let capturedReq: any;
      const testApp = express();
      testApp.use(apiKeyAuth);
      testApp.get("/test", (req, res) => {
        capturedReq = req;
        res.json({ ok: true });
      });

      await request(testApp)
        .get("/test")
        .set("X-API-Key", "long-key-without-explicit-id");

      expect(capturedReq.rateLimitKey).toBe("org-no-id:long-key");
    });
  });

  // ─── 2. Missing Header Scenarios (401 Unauthorized) ──────────────────────────

  describe("2. Missing headers scenarios", () => {
    it("returns 401 when no authorization headers are present", async () => {
      const res = await request(app).get("/api/admin/maintainers");

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Unauthorized");
      expect(res.body.message).toMatch(/Missing API key or Authorization header/i);
    });

    it("returns 401 on POST when headers are missing", async () => {
      const res = await request(app)
        .post("/api/admin/maintainers")
        .send({ address: "GBX...", org_id: "test" });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Unauthorized");
    });
  });

  // ─── 3. Malformed Formats & Non-ASCII Tokens (401 Unauthorized) ───────────────

  describe("3. Invalid format and non-ASCII token edge cases", () => {
    it("returns 401 when Authorization header is empty or only whitespace", async () => {
      const res = await request(app)
        .get("/api/admin/maintainers")
        .set("Authorization", "   ");

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/empty/i);
    });

    it("returns 401 when Bearer scheme has no token ('Bearer')", async () => {
      const res = await request(app)
        .get("/api/admin/maintainers")
        .set("Authorization", "Bearer");

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/Bearer token missing or malformed/i);
    });

    it("returns 401 when Bearer scheme has trailing spaces only ('Bearer   ')", async () => {
      const res = await request(app)
        .get("/api/admin/maintainers")
        .set("Authorization", "Bearer    ");

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/Bearer token missing or malformed/i);
    });

    it("returns 401 when unsupported authorization scheme is used ('Basic ...')", async () => {
      const res = await request(app)
        .get("/api/admin/maintainers")
        .set("Authorization", "Basic dXNlcjpwYXNz");

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/expected Bearer/i);
    });

    it("returns 401 when X-API-Key is empty string", async () => {
      const res = await request(app)
        .get("/api/admin/maintainers")
        .set("X-API-Key", "");

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/empty/i);
    });

    it("returns 401 when X-API-Key is only whitespace", async () => {
      const res = await request(app)
        .get("/api/admin/maintainers")
        .set("X-API-Key", "    ");

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/empty/i);
    });

    it("returns 401 when x-admin-token is empty string", async () => {
      const res = await request(app)
        .get("/api/admin/maintainers")
        .set("x-admin-token", "  ");

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/empty/i);
    });

    it("returns 401 when token contains non-ASCII unicode characters", () => {
      const req: any = {
        headers: { "x-api-key": "api-key-with-unicode-\uD83D\uDD11" },
        method: "GET",
      };
      let statusSent = 0;
      let bodySent: any = null;
      const res: any = {
        status(code: number) {
          statusSent = code;
          return this;
        },
        json(body: any) {
          bodySent = body;
          return this;
        },
      };
      const next = vi.fn();

      apiKeyAuth(req, res, next);

      expect(statusSent).toBe(401);
      expect(bodySent.error).toBe("Unauthorized");
      expect(bodySent.message).toMatch(/non-ASCII/i);
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 401 when token contains non-ASCII accents", async () => {
      const res = await request(app)
        .get("/api/admin/maintainers")
        .set("Authorization", "Bearer cl\u00e9-secr\u00e8te");

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/non-ASCII/i);
    });

    it("returns 401 when key is unknown / unrecognized", async () => {
      registerApiKey({
        key: "known-key-12345",
        org: "known-org",
        scopes: ["read"],
      });

      const res = await request(app)
        .get("/api/admin/maintainers")
        .set("X-API-Key", "unknown-bogus-key-67890");

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/Invalid API key/i);
    });

    it("returns 401 when API key has expired", async () => {
      registerApiKey({
        key: "expired-key-123",
        org: "expired-org",
        scopes: ["read"],
        expiresAt: new Date(Date.now() - 60_000), // 1 minute in the past
      });

      const res = await request(app)
        .get("/api/admin/maintainers")
        .set("X-API-Key", "expired-key-123");

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/expired/i);
    });

    it("succeeds when API key expiration date is in the future", async () => {
      registerApiKey({
        key: "future-key-123",
        org: "future-org",
        scopes: ["read"],
        expiresAt: new Date(Date.now() + 600_000), // 10 minutes in the future
      });

      const res = await request(app)
        .get("/api/admin/maintainers")
        .set("X-API-Key", "future-key-123");

      expect(res.status).toBe(200);
      expect(res.body.org).toBe("future-org");
    });
  });

  // ─── 4. Revocation Check (403 Forbidden) ─────────────────────────────────────

  describe("4. Revoked API key scenarios", () => {
    it("returns 403 Forbidden when API key is marked revoked in registration", async () => {
      registerApiKey({
        key: "revoked-secret-key-456",
        org: "compromised-org",
        scopes: ["read", "write"],
        revoked: true,
      });

      const res = await request(app)
        .get("/api/admin/maintainers")
        .set("X-API-Key", "revoked-secret-key-456");

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Forbidden");
      expect(res.body.message).toMatch(/revoked/i);
    });

    it("returns 403 Forbidden after key is dynamically revoked via revokeApiKey()", async () => {
      const activeKey = "dynamically-revoked-key";
      registerApiKey({
        key: activeKey,
        org: "test-org",
        scopes: ["read", "write"],
        revoked: false,
      });

      // 1. Should be 200 before revocation
      const res1 = await request(app)
        .get("/api/admin/maintainers")
        .set("X-API-Key", activeKey);
      expect(res1.status).toBe(200);

      // 2. Revoke key
      revokeApiKey(activeKey);

      // 3. Should now be 403 Forbidden
      const res2 = await request(app)
        .get("/api/admin/maintainers")
        .set("X-API-Key", activeKey);
      expect(res2.status).toBe(403);
      expect(res2.body.message).toMatch(/revoked/i);
    });

    it("handles revoking an un-registered key", () => {
      expect(() => revokeApiKey("unregistered-key-to-revoke")).not.toThrow();
    });
  });

  // ─── 5. Timing Attack Resistance (Constant-Time Comparison) ──────────────────

  describe("5. Constant-time comparison & timing attack mitigation", () => {
    it("returns true for matching strings and false for mismatched strings", () => {
      expect(constantTimeCompare("secret-token-123", "secret-token-123")).toBe(true);
      expect(constantTimeCompare("secret-token-123", "secret-token-456")).toBe(false);
      expect(constantTimeCompare("short", "much-longer-string-test")).toBe(false);
      expect(constantTimeCompare("", "")).toBe(true);
      expect(constantTimeCompare("", "non-empty")).toBe(false);
    });

    it("invokes crypto.timingSafeEqual on fixed-length 32-byte SHA-256 buffers", () => {
      const timingSafeSpy = vi.spyOn(crypto, "timingSafeEqual");

      constantTimeCompare("test-token-a", "test-token-b");

      expect(timingSafeSpy).toHaveBeenCalled();
      const [bufA, bufB] = timingSafeSpy.mock.calls[0];
      expect(bufA.length).toBe(32);
      expect(bufB.length).toBe(32);
    });

    it("exhibits uniform execution time across different mismatch byte positions", () => {
      const keyBase = "a".repeat(64);
      const diffFirstChar = "b" + "a".repeat(63);
      const diffLastChar = "a".repeat(63) + "b";

      // Warm up JIT
      for (let i = 0; i < 500; i++) {
        constantTimeCompare(keyBase, diffFirstChar);
        constantTimeCompare(keyBase, diffLastChar);
      }

      const iterations = 5000;

      const t0 = performance.now();
      for (let i = 0; i < iterations; i++) {
        constantTimeCompare(keyBase, diffFirstChar);
      }
      const durationFirstDiff = performance.now() - t0;

      const t1 = performance.now();
      for (let i = 0; i < iterations; i++) {
        constantTimeCompare(keyBase, diffLastChar);
      }
      const durationLastDiff = performance.now() - t1;

      // Both should execute in nearly identical time frame without exponential deviation
      const ratio = durationFirstDiff / (durationLastDiff || 1);
      expect(ratio).toBeGreaterThan(0.3);
      expect(ratio).toBeLessThan(3.0);
    });
  });

  // ─── 6. Scope Enforcement (Read-Only vs Mutation Methods) ────────────────────

  describe("6. Scope enforcement: read-only keys blocked from mutations", () => {
    beforeEach(() => {
      registerApiKey({
        key: "read-only-key-999",
        org: "readonly-org",
        scopes: ["read"],
      });
      registerApiKey({
        key: "write-key-999",
        org: "writer-org",
        scopes: ["read", "write"],
      });
      registerApiKey({
        key: "admin-key-999",
        org: "admin-org",
        scopes: ["admin"],
      });
      registerApiKey({
        key: "wildcard-key-999",
        org: "wildcard-org",
        scopes: ["*"],
      });
    });

    it("allows read-only key on GET endpoint", async () => {
      const res = await request(app)
        .get("/api/admin/maintainers")
        .set("X-API-Key", "read-only-key-999");

      expect(res.status).toBe(200);
      expect(res.body.org).toBe("readonly-org");
    });

    it("blocks read-only key on POST route with 403 Forbidden", async () => {
      const res = await request(app)
        .post("/api/admin/maintainers")
        .set("X-API-Key", "read-only-key-999")
        .send({ address: "GABC...", org_id: "test" });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Forbidden");
      expect(res.body.message).toMatch(/read-only API key cannot perform mutation/i);
    });

    it("blocks read-only key on PUT route with 403 Forbidden", async () => {
      const testApp = express();
      testApp.use(apiKeyAuth);
      testApp.put("/test-put", (_req, res) => res.json({ ok: true }));

      const res = await request(testApp)
        .put("/test-put")
        .set("X-API-Key", "read-only-key-999");

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/read-only/i);
    });

    it("blocks read-only key on PATCH route with 403 Forbidden", async () => {
      const testApp = express();
      testApp.use(apiKeyAuth);
      testApp.patch("/test-patch", (_req, res) => res.json({ ok: true }));

      const res = await request(testApp)
        .patch("/test-patch")
        .set("X-API-Key", "read-only-key-999");

      expect(res.status).toBe(403);
    });

    it("blocks read-only key on DELETE route with 403 Forbidden", async () => {
      const testApp = express();
      testApp.use(apiKeyAuth);
      testApp.delete("/test-delete", (_req, res) => res.json({ ok: true }));

      const res = await request(testApp)
        .delete("/test-delete")
        .set("X-API-Key", "read-only-key-999");

      expect(res.status).toBe(403);
    });

    it("permits key with 'write' scope on POST route", async () => {
      const res = await request(app)
        .post("/api/admin/maintainers")
        .set("X-API-Key", "write-key-999")
        .send({ address: "GABC...", org_id: "test" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("created");
    });

    it("permits key with 'admin' scope on POST route", async () => {
      const res = await request(app)
        .post("/api/admin/maintainers")
        .set("X-API-Key", "admin-key-999")
        .send({ address: "GABC...", org_id: "test" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("created");
    });

    it("permits key with '*' wildcard scope on POST route", async () => {
      const res = await request(app)
        .post("/api/admin/maintainers")
        .set("X-API-Key", "wildcard-key-999")
        .send({ address: "GABC...", org_id: "test" });

      expect(res.status).toBe(200);
    });
  });

  // ─── 7. Custom Options & Factory Usage ───────────────────────────────────────

  describe("7. Options factory and header array handling", () => {
    it("supports apiKeyAuth(options) factory with scoped custom keys array", async () => {
      const customKeys: ApiKeyRecord[] = [
        {
          key: "custom-key-opt-1",
          org: "custom-opt-org",
          scopes: ["read", "write"],
        },
      ];

      const customApp = express();
      customApp.use(apiKeyAuth({ keys: customKeys, requireWriteForMutations: true }));
      customApp.post("/custom-post", (req, res) =>
        res.json({ org: (req as any).org }),
      );

      const res = await request(customApp)
        .post("/custom-post")
        .set("X-API-Key", "custom-key-opt-1");

      expect(res.status).toBe(200);
      expect(res.body.org).toBe("custom-opt-org");

      // Invalid key against custom keys array
      const invalidRes = await request(customApp)
        .post("/custom-post")
        .set("X-API-Key", "wrong-key");
      expect(invalidRes.status).toBe(401);
    });

    it("supports requireWriteForMutations: false option", async () => {
      const customKeys: ApiKeyRecord[] = [
        {
          key: "read-only-permitted-key",
          org: "relaxed-org",
          scopes: ["read"],
        },
      ];

      const relaxedApp = express();
      relaxedApp.use(apiKeyAuth({ keys: customKeys, requireWriteForMutations: false }));
      relaxedApp.post("/relaxed-post", (_req, res) => res.json({ ok: true }));

      const res = await request(relaxedApp)
        .post("/relaxed-post")
        .set("X-API-Key", "read-only-permitted-key");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("handles headers passed as string arrays (Express multi-header edge cases)", async () => {
      registerApiKey({
        key: "array-test-key",
        org: "array-org",
        scopes: ["read"],
      });

      // Test X-API-Key as array
      const testApp1 = express();
      testApp1.use((req, _res, next) => {
        req.headers["x-api-key"] = ["array-test-key", "secondary"] as any;
        next();
      });
      testApp1.use(apiKeyAuth);
      testApp1.get("/array-test", (req, res) =>
        res.json({ org: (req as any).org }),
      );
      const res1 = await request(testApp1).get("/array-test");
      expect(res1.status).toBe(200);
      expect(res1.body.org).toBe("array-org");

      // Test Authorization as array
      const testApp2 = express();
      testApp2.use((req, _res, next) => {
        req.headers["authorization"] = ["Bearer array-test-key", "secondary"] as any;
        next();
      });
      testApp2.use(apiKeyAuth);
      testApp2.get("/array-auth", (req, res) =>
        res.json({ org: (req as any).org }),
      );
      const res2 = await request(testApp2).get("/array-auth");
      expect(res2.status).toBe(200);
      expect(res2.body.org).toBe("array-org");

      // Test x-admin-token as array
      const testApp3 = express();
      testApp3.use((req, _res, next) => {
        req.headers["x-admin-token"] = ["array-test-key", "secondary"] as any;
        next();
      });
      testApp3.use(apiKeyAuth);
      testApp3.get("/array-admin", (req, res) =>
        res.json({ org: (req as any).org }),
      );
      const res3 = await request(testApp3).get("/array-admin");
      expect(res3.status).toBe(200);
      expect(res3.body.org).toBe("array-org");
    });
  });
});
