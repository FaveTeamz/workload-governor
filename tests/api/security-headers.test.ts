/**
 * security-headers.test.ts  (tests/api)
 *
 * Regression tests for issue #1098 — enforce CSP, strict HSTS and
 * X-Frame-Options on every backend response.
 *
 * Coverage:
 *  1. Strict HSTS with preload on /health
 *  2. Content-Security-Policy with default-src 'self' and object-src 'none'
 *  3. X-Frame-Options: DENY
 *  4. Referrer-Policy present
 */

import request from "supertest";
import { MockPool } from "./setup";

const mockPool = new MockPool();
jest.mock("../../src/db", () => ({
  pool: mockPool,
  migrate: jest.fn(),
  healthCheck: jest.fn(),
}));

jest.mock("../../src/services/redis", () => ({
  invalidateCache: jest.fn().mockResolvedValue(undefined),
  getCached: jest.fn().mockResolvedValue(null),
  setCached: jest.fn().mockResolvedValue(undefined),
}));

import { createApp } from "../../src/app";

const app = createApp();

describe("Security headers (issue #1098)", () => {
  it("sets strict HSTS with preload", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["strict-transport-security"]).toBe(
      "max-age=31536000; includeSubDomains; preload"
    );
  });

  it("sets a Content-Security-Policy locking down defaults", async () => {
    const res = await request(app).get("/health");
    const csp = res.headers["content-security-policy"];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("denies framing via X-Frame-Options", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("sets a strict Referrer-Policy", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("does not allow inline scripts in CSP", async () => {
    const res = await request(app).get("/health");
    const csp = res.headers["content-security-policy"] || "";
    const scriptSrc = csp
      .split(";")
      .map((d: string) => d.trim())
      .find((d: string) => d.startsWith("script-src"));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });
});
