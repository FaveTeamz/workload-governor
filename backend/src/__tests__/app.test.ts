/**
 * app.test.ts — Integration tests for HTTPS enforcement and HSTS (#1311)
 *
 * Acceptance criteria verified:
 *   ✓ Plain HTTP (X-Forwarded-Proto: http) → HTTP 301 redirect in production.
 *   ✓ Redirect Location is the https:// equivalent of the original URL.
 *   ✓ Redirect preserves the Host header and request path.
 *   ✓ Redirect preserves the query string.
 *   ✓ HTTPS requests (X-Forwarded-Proto: https) pass through — no redirect.
 *   ✓ Redirect middleware inactive outside production — no 301 on plain HTTP.
 *   ✓ Strict-Transport-Security header present on every response.
 *   ✓ HSTS max-age equals 31536000 (1 year).
 *   ✓ HSTS header includes includeSubDomains.
 *   ✓ HSTS header includes preload.
 *   ✓ HSTS emitted in non-production environments too (Helmet always applies).
 *
 * All external dependencies (health handler, DB, Soroban RPC, scheduler) are
 * mocked so the test suite runs without any network or infrastructure access.
 */

import request from "supertest";

// ── Mock infrastructure dependencies before importing app ─────────────────────
// jest.mock() is hoisted before imports, so these factories run first.
// We mock the leaf modules (health, scheduler, logger) that have hard runtime
// dependencies (pg, pino, ioredis) so that ts-jest never tries to resolve them.

jest.mock("../health.js", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  healthHandler: jest.fn((_req: any, res: any) => {
    res.json({ status: "healthy", dependencies: [] });
  }),
}));

jest.mock("../scheduler.js", () => ({
  startScheduler: jest.fn(() => ({ stop: jest.fn() })),
}));

jest.mock("../logger.js", () => {
  const mockLogger = {
    debug: jest.fn(),
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockLogger,
    logger:  mockLogger,
  };
});

// Import after all mocks are in place
import { createApp } from "../app.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a production-mode app instance. */
function prodApp() {
  process.env.NODE_ENV = "production";
  return createApp();
}

/** Create a non-production app instance (default dev / test behaviour). */
function devApp() {
  delete process.env.NODE_ENV;
  return createApp();
}

afterEach(() => {
  delete process.env.NODE_ENV;
});

// ── HTTPS redirect — production mode ─────────────────────────────────────────

describe("HTTPS redirect middleware (production)", () => {
  it("returns 301 for a plain-HTTP request (X-Forwarded-Proto: http)", async () => {
    const res = await request(prodApp())
      .get("/api/health")
      .set("X-Forwarded-Proto", "http")
      .set("Host", "api.example.com");

    expect(res.status).toBe(301);
  });

  it("sets the Location header to the https:// equivalent", async () => {
    const res = await request(prodApp())
      .get("/api/health")
      .set("X-Forwarded-Proto", "http")
      .set("Host", "api.example.com");

    expect(res.headers["location"]).toMatch(/^https:\/\//);
  });

  it("preserves the Host and path in the redirect Location", async () => {
    const res = await request(prodApp())
      .get("/api/health")
      .set("X-Forwarded-Proto", "http")
      .set("Host", "api.example.com");

    expect(res.headers["location"]).toBe("https://api.example.com/api/health");
  });

  it("preserves the query string in the redirect Location", async () => {
    const res = await request(prodApp())
      .get("/api/health?verbose=true&format=json")
      .set("X-Forwarded-Proto", "http")
      .set("Host", "api.example.com");

    expect(res.headers["location"]).toBe(
      "https://api.example.com/api/health?verbose=true&format=json",
    );
  });

  it("does NOT redirect HTTPS requests — passes through to the health handler", async () => {
    const res = await request(prodApp())
      .get("/api/health")
      .set("X-Forwarded-Proto", "https")
      .set("Host", "api.example.com");

    // Any status other than 301 means the redirect was not triggered.
    expect(res.status).not.toBe(301);
    expect(res.status).toBe(200);
  });

  it("redirects requests to paths other than /api/health", async () => {
    const res = await request(prodApp())
      .get("/some/other/path")
      .set("X-Forwarded-Proto", "http")
      .set("Host", "api.example.com");

    expect(res.status).toBe(301);
    expect(res.headers["location"]).toBe(
      "https://api.example.com/some/other/path",
    );
  });
});

// ── HTTPS redirect — non-production ──────────────────────────────────────────

describe("HTTPS redirect middleware (non-production)", () => {
  it("does NOT redirect plain HTTP when NODE_ENV is not production", async () => {
    const res = await request(devApp())
      .get("/api/health")
      .set("X-Forwarded-Proto", "http")
      .set("Host", "localhost");

    // Redirect middleware is inactive; request reaches the health handler.
    expect(res.status).not.toBe(301);
  });
});

// ── HSTS header ───────────────────────────────────────────────────────────────

describe("Strict-Transport-Security header", () => {
  it("is present on HTTPS responses in production", async () => {
    const res = await request(prodApp())
      .get("/api/health")
      .set("X-Forwarded-Proto", "https");

    expect(res.headers).toHaveProperty("strict-transport-security");
  });

  it("is present in non-production environments (Helmet always applies HSTS)", async () => {
    const res = await request(devApp()).get("/api/health");

    expect(res.headers).toHaveProperty("strict-transport-security");
  });

  it("sets max-age to exactly 31536000 (1 year)", async () => {
    const res = await request(prodApp())
      .get("/api/health")
      .set("X-Forwarded-Proto", "https");

    const hsts = res.headers["strict-transport-security"] as string;
    const match = hsts.match(/max-age=(\d+)/);
    expect(match).not.toBeNull();
    expect(parseInt(match![1], 10)).toBe(31_536_000);
  });

  it("includes the includeSubDomains directive", async () => {
    const res = await request(prodApp())
      .get("/api/health")
      .set("X-Forwarded-Proto", "https");

    const hsts = res.headers["strict-transport-security"] as string;
    expect(hsts.toLowerCase()).toContain("includesubdomains");
  });

  it("includes the preload directive", async () => {
    const res = await request(prodApp())
      .get("/api/health")
      .set("X-Forwarded-Proto", "https");

    const hsts = res.headers["strict-transport-security"] as string;
    expect(hsts.toLowerCase()).toContain("preload");
  });
});
