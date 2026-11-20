/**
 * app.test.ts — Security response headers on every backend response (#1314)
 *
 * Acceptance criteria verified:
 *   ✓ Content-Security-Policy present with restrictive directives
 *   ✓ X-Frame-Options: DENY prevents clickjacking
 *   ✓ X-Content-Type-Options: nosniff enforced
 *   ✓ Referrer-Policy: strict-origin-when-cross-origin
 *   ✓ Headers present on both API responses and the 404 fallback
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const { mockStop } = vi.hoisted(() => ({ mockStop: vi.fn() }));

vi.mock("./health.js", () => ({
  healthHandler: (_req: unknown, res: { json: (body: unknown) => void }) => {
    res.json({ status: "ok" });
  },
}));

vi.mock("./scheduler.js", () => ({
  startScheduler: () => ({ stop: mockStop }),
}));

vi.mock("./tracing.js", () => ({
  xrayMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("./logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createApp } from "./app.js";

describe("security response headers", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createApp().listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it.each(["/api/health", "/does-not-exist"])(
    "sets the full header set on %s",
    async (path) => {
      const response = await fetch(`${baseUrl}${path}`);
      const csp = response.headers.get("content-security-policy") ?? "";

      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
      expect(csp).toContain("img-src 'self' data: https://avatars.githubusercontent.com");
      expect(csp).toContain(
        "connect-src 'self' https://horizon-testnet.stellar.org https://horizon.stellar.org",
      );
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    },
  );
});
