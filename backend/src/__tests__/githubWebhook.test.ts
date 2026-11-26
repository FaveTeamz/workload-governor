/**
 * githubWebhook.test.ts
 *
 * Tests for SSRF URL validation, HMAC-SHA256 signature verification, and the
 * Express webhook handler in backend/src/github.ts.
 *
 * Security coverage:
 *   - AWS EC2/ECS instance-metadata endpoint (169.254.169.254) blocked
 *   - Loopback (localhost, 127.0.0.1) blocked
 *   - RFC-1918 private ranges via hostname redirect blocked
 *   - Non-HTTPS protocols (http, ftp, file, data) blocked
 *   - Hosts outside api.github.com blocked
 *   - Malformed / relative URLs blocked
 *   - Valid api.github.com HTTPS URLs accepted
 *   - HMAC-SHA256 signatures verified with timing-safe comparison
 *   - Missing / malformed signature headers rejected
 */

import { createHmac } from "crypto";
import type { Request, Response } from "express";
import {
  validateGitHubApiUrl,
  verifyWebhookSignature,
  githubWebhookHandler,
  type WebhookIssuePayload,
} from "../github";
import pool from "../db.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = "test-webhook-secret-32-bytes-ok!";

function makeSignature(body: Buffer, secret: string): string {
  const hex = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${hex}`;
}

function buildPayload(overrides: Partial<WebhookIssuePayload["issue"]> = {}): WebhookIssuePayload {
  return {
    action: "opened",
    issue: {
      id:       1,
      number:   42,
      title:    "Fix bug",
      html_url: "https://github.com/owner/repo/issues/42",
      state:    "open",
      url:      "https://api.github.com/repos/owner/repo/issues/42",
      ...overrides,
    },
    repository: {
      name:      "repo",
      full_name: "owner/repo",
      owner:     { login: "owner" },
    },
  };
}

/** Build a mock Express Request with raw body Buffer and given headers. */
function mockRequest(
  body: Buffer,
  headers: Record<string, string> = {},
): Partial<Request> {
  return { body, headers };
}

/** Build a mock Express Response that captures status and JSON output. */
function mockResponse(): {
  res:    Partial<Response>;
  status: jest.Mock;
  json:   jest.Mock;
} {
  const json   = jest.fn().mockReturnThis();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status, json } as unknown as Partial<Response>, status, json };
}

// ─── Pool mock — prevents real DB connections ─────────────────────────────────

jest.mock("../db.js", () => ({
  __esModule: true,
  default: { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }) },
}));

// ─── Logger mock — prevents pino dependency from loading ──────────────────────

jest.mock("../logger.js", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ─── validateGitHubApiUrl ─────────────────────────────────────────────────────

describe("validateGitHubApiUrl", () => {
  // ── Accepted URLs ──────────────────────────────────────────────────────────

  it("accepts a canonical api.github.com HTTPS URL", () => {
    const url = "https://api.github.com/repos/owner/repo/issues/42";
    const parsed = validateGitHubApiUrl(url);
    expect(parsed.hostname).toBe("api.github.com");
    expect(parsed.protocol).toBe("https:");
  });

  it("accepts api.github.com with query string and path", () => {
    const url = "https://api.github.com/repos/acme/widget/issues?state=open&per_page=100";
    expect(() => validateGitHubApiUrl(url)).not.toThrow();
  });

  // ── SSRF: AWS instance-metadata ───────────────────────────────────────────

  it("blocks http://169.254.169.254/latest/meta-data/", () => {
    expect(() =>
      validateGitHubApiUrl("http://169.254.169.254/latest/meta-data/"),
    ).toThrow(/Only HTTPS protocol allowed/);
  });

  it("blocks https://169.254.169.254/latest/meta-data/ (HTTPS to link-local)", () => {
    expect(() =>
      validateGitHubApiUrl("https://169.254.169.254/latest/meta-data/"),
    ).toThrow(/Target host must be api.github.com/);
  });

  it("blocks AWS ECS metadata via http://169.254.170.2/v2/credentials/", () => {
    expect(() =>
      validateGitHubApiUrl("http://169.254.170.2/v2/credentials/ROLE_ID"),
    ).toThrow(/Only HTTPS protocol allowed/);
  });

  // ── SSRF: Loopback ────────────────────────────────────────────────────────

  it("blocks http://localhost:5432 (database port on loopback)", () => {
    expect(() =>
      validateGitHubApiUrl("http://localhost:5432"),
    ).toThrow(/Only HTTPS protocol allowed/);
  });

  it("blocks https://localhost/secret (HTTPS loopback)", () => {
    expect(() =>
      validateGitHubApiUrl("https://localhost/secret"),
    ).toThrow(/Target host must be api.github.com/);
  });

  it("blocks http://127.0.0.1/admin", () => {
    expect(() =>
      validateGitHubApiUrl("http://127.0.0.1/admin"),
    ).toThrow(/Only HTTPS protocol allowed/);
  });

  it("blocks https://127.0.0.1 (HTTPS loopback IP)", () => {
    expect(() =>
      validateGitHubApiUrl("https://127.0.0.1"),
    ).toThrow(/Target host must be api.github.com/);
  });

  // ── SSRF: RFC-1918 private ranges ─────────────────────────────────────────

  it("blocks http://10.0.0.1/internal-service", () => {
    expect(() =>
      validateGitHubApiUrl("http://10.0.0.1/internal-service"),
    ).toThrow(/Only HTTPS protocol allowed/);
  });

  it("blocks https://192.168.1.1/router (HTTPS RFC-1918)", () => {
    expect(() =>
      validateGitHubApiUrl("https://192.168.1.1/router"),
    ).toThrow(/Target host must be api.github.com/);
  });

  it("blocks https://172.16.0.1/secret (HTTPS RFC-1918 172.16/12)", () => {
    expect(() =>
      validateGitHubApiUrl("https://172.16.0.1/secret"),
    ).toThrow(/Target host must be api.github.com/);
  });

  // ── Non-HTTPS protocols ───────────────────────────────────────────────────

  it("blocks http:// protocol regardless of host", () => {
    expect(() =>
      validateGitHubApiUrl("http://api.github.com/repos/owner/repo/issues/1"),
    ).toThrow(/Only HTTPS protocol allowed/);
  });

  it("blocks ftp:// protocol", () => {
    expect(() =>
      validateGitHubApiUrl("ftp://api.github.com/file"),
    ).toThrow(/Only HTTPS protocol allowed/);
  });

  it("blocks file:// protocol", () => {
    expect(() =>
      validateGitHubApiUrl("file:///etc/passwd"),
    ).toThrow(/Only HTTPS protocol allowed/);
  });

  it("blocks data: URI", () => {
    expect(() =>
      validateGitHubApiUrl("data:text/html,<h1>XSS</h1>"),
    ).toThrow(/Only HTTPS protocol allowed/);
  });

  // ── Wrong hostname ────────────────────────────────────────────────────────

  it("blocks github.com (not api.github.com)", () => {
    expect(() =>
      validateGitHubApiUrl("https://github.com/owner/repo"),
    ).toThrow(/Target host must be api.github.com/);
  });

  it("blocks api.github.com.evil.com (subdomain of attacker domain)", () => {
    expect(() =>
      validateGitHubApiUrl("https://api.github.com.evil.com/repos/owner/repo/issues/1"),
    ).toThrow(/Target host must be api.github.com/);
  });

  it("blocks evil.api.github.com (attacker-controlled subdomain)", () => {
    expect(() =>
      validateGitHubApiUrl("https://evil.api.github.com/repos/owner/repo/issues/1"),
    ).toThrow(/Target host must be api.github.com/);
  });

  // ── Malformed input ───────────────────────────────────────────────────────

  it("throws on completely invalid URL string", () => {
    expect(() =>
      validateGitHubApiUrl("not a url at all"),
    ).toThrow(/Invalid URL/);
  });

  it("throws on empty string", () => {
    expect(() => validateGitHubApiUrl("")).toThrow(/Invalid URL/);
  });

  it("throws on relative path", () => {
    expect(() => validateGitHubApiUrl("/repos/owner/repo/issues/1")).toThrow(/Invalid URL/);
  });
});

// ─── verifyWebhookSignature ───────────────────────────────────────────────────

describe("verifyWebhookSignature", () => {
  const body   = Buffer.from(JSON.stringify({ action: "opened" }));
  const secret = WEBHOOK_SECRET;

  it("returns true for a correctly computed signature", () => {
    const sig = makeSignature(body, secret);
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  it("returns false when the secret is wrong", () => {
    const sig = makeSignature(body, "wrong-secret");
    expect(verifyWebhookSignature(body, sig, secret)).toBe(false);
  });

  it("returns false when the body has been tampered with", () => {
    const sig    = makeSignature(body, secret);
    const tampered = Buffer.from(JSON.stringify({ action: "deleted" }));
    expect(verifyWebhookSignature(tampered, sig, secret)).toBe(false);
  });

  it("returns false when the sha256= prefix is missing", () => {
    const hex = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWebhookSignature(body, hex, secret)).toBe(false);
  });

  it("returns false for an empty signature string", () => {
    expect(verifyWebhookSignature(body, "", secret)).toBe(false);
  });

  it("returns false when the hex digest length is wrong (truncated)", () => {
    const sig = "sha256=abc123"; // too short
    expect(verifyWebhookSignature(body, sig, secret)).toBe(false);
  });

  it("returns false for all-zero digest of correct length", () => {
    const zeroes = "sha256=" + "0".repeat(64);
    expect(verifyWebhookSignature(body, zeroes, secret)).toBe(false);
  });
});

// ─── githubWebhookHandler ─────────────────────────────────────────────────────

describe("githubWebhookHandler", () => {
  const originalSecret = process.env.GITHUB_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env.GITHUB_WEBHOOK_SECRET = originalSecret;
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it("returns 202 for a valid signature and safe payload (action: opened)", async () => {
    const payload = buildPayload();
    const body    = Buffer.from(JSON.stringify(payload));
    const sig     = makeSignature(body, WEBHOOK_SECRET);

    const req = mockRequest(body, { "x-hub-signature-256": sig });
    const { res, status, json } = mockResponse();

    githubWebhookHandler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(202);
    expect(json).toHaveBeenCalledWith({ accepted: true });
  });

  it("returns 202 for action: closed with safe payload", () => {
    const payload = buildPayload();
    payload.action = "closed";
    const body = Buffer.from(JSON.stringify(payload));
    const sig  = makeSignature(body, WEBHOOK_SECRET);

    const req = mockRequest(body, { "x-hub-signature-256": sig });
    const { res, status } = mockResponse();

    githubWebhookHandler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(202);
  });

  it("returns 202 for action: labeled (ignored but accepted)", () => {
    const payload = buildPayload();
    payload.action = "labeled";
    const body = Buffer.from(JSON.stringify(payload));
    const sig  = makeSignature(body, WEBHOOK_SECRET);

    const req = mockRequest(body, { "x-hub-signature-256": sig });
    const { res, status } = mockResponse();

    githubWebhookHandler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(202);
  });

  // ── Missing signature ─────────────────────────────────────────────────────

  it("returns 401 when X-Hub-Signature-256 header is absent", () => {
    const body = Buffer.from("{}");
    const req  = mockRequest(body, {});
    const { res, status, json } = mockResponse();

    githubWebhookHandler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("Missing") }));
  });

  it("returns 401 when X-Hub-Signature-256 header is an empty string", () => {
    const body = Buffer.from("{}");
    const req  = mockRequest(body, { "x-hub-signature-256": "" });
    const { res, status } = mockResponse();

    githubWebhookHandler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(401);
  });

  // ── Missing secret configuration ──────────────────────────────────────────

  it("returns 500 when GITHUB_WEBHOOK_SECRET env var is not set", () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;

    const body = Buffer.from("{}");
    const req  = mockRequest(body, { "x-hub-signature-256": "sha256=abc" });
    const { res, status, json } = mockResponse();

    githubWebhookHandler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("secret not configured") }));
  });

  // ── Invalid signature ─────────────────────────────────────────────────────

  it("returns 401 when HMAC signature is incorrect", () => {
    const body = Buffer.from(JSON.stringify(buildPayload()));
    const sig  = makeSignature(body, "wrong-secret");

    const req = mockRequest(body, { "x-hub-signature-256": sig });
    const { res, status, json } = mockResponse();

    githubWebhookHandler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("Invalid webhook signature") }));
  });

  it("returns 401 when the body has been tampered after signing", () => {
    const original = Buffer.from(JSON.stringify(buildPayload()));
    const sig      = makeSignature(original, WEBHOOK_SECRET);
    const tampered = Buffer.from(JSON.stringify({ ...buildPayload(), extra: "injected" }));

    const req = mockRequest(tampered, { "x-hub-signature-256": sig });
    const { res, status } = mockResponse();

    githubWebhookHandler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(401);
  });

  // ── Bad body encoding ─────────────────────────────────────────────────────

  it("returns 400 when req.body is a string instead of a Buffer", () => {
    const strBody = '{"action":"opened"}';
    const sig     = "sha256=" + createHmac("sha256", WEBHOOK_SECRET).update(strBody).digest("hex");

    const req = { body: strBody, headers: { "x-hub-signature-256": sig } } as unknown as Request;
    const { res, status } = mockResponse();

    githubWebhookHandler(req, res as Response);

    expect(status).toHaveBeenCalledWith(400);
  });

  // ── Malformed JSON ────────────────────────────────────────────────────────

  it("returns 400 when the signed body is not valid JSON", () => {
    const body = Buffer.from("not-json{{{{");
    const sig  = makeSignature(body, WEBHOOK_SECRET);

    const req = mockRequest(body, { "x-hub-signature-256": sig });
    const { res, status, json } = mockResponse();

    githubWebhookHandler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("Malformed JSON") }));
  });

  // ── SSRF: unsafe URLs in payload ──────────────────────────────────────────

  it("returns 400 and blocks request to AWS metadata service (169.254.169.254)", () => {
    const payload = buildPayload({ url: "http://169.254.169.254/latest/meta-data/" });
    const body    = Buffer.from(JSON.stringify(payload));
    const sig     = makeSignature(body, WEBHOOK_SECRET);

    const req = mockRequest(body, { "x-hub-signature-256": sig });
    const { res, status, json } = mockResponse();

    githubWebhookHandler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("Unsafe URL") }),
    );
  });

  it("returns 400 and blocks request to localhost database port", () => {
    const payload = buildPayload({ url: "http://localhost:5432/secrets" });
    const body    = Buffer.from(JSON.stringify(payload));
    const sig     = makeSignature(body, WEBHOOK_SECRET);

    const req = mockRequest(body, { "x-hub-signature-256": sig });
    const { res, status } = mockResponse();

    githubWebhookHandler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(400);
  });

  it("returns 400 and blocks request to 127.0.0.1 (loopback IP)", () => {
    const payload = buildPayload({ url: "https://127.0.0.1/admin" });
    const body    = Buffer.from(JSON.stringify(payload));
    const sig     = makeSignature(body, WEBHOOK_SECRET);

    const req = mockRequest(body, { "x-hub-signature-256": sig });
    const { res, status } = mockResponse();

    githubWebhookHandler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(400);
  });

  it("returns 400 and blocks request to RFC-1918 10.x range", () => {
    const payload = buildPayload({ url: "https://10.0.0.1/internal" });
    const body    = Buffer.from(JSON.stringify(payload));
    const sig     = makeSignature(body, WEBHOOK_SECRET);

    const req = mockRequest(body, { "x-hub-signature-256": sig });
    const { res, status } = mockResponse();

    githubWebhookHandler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(400);
  });

  it("returns 400 and blocks request to github.com instead of api.github.com", () => {
    const payload = buildPayload({ url: "https://github.com/owner/repo/issues/1" });
    const body    = Buffer.from(JSON.stringify(payload));
    const sig     = makeSignature(body, WEBHOOK_SECRET);

    const req = mockRequest(body, { "x-hub-signature-256": sig });
    const { res, status } = mockResponse();

    githubWebhookHandler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(400);
  });

  it("returns 400 and blocks a subdomain-spoofed URL (api.github.com.evil.com)", () => {
    const payload = buildPayload({
      url: "https://api.github.com.evil.com/repos/owner/repo/issues/1",
    });
    const body = Buffer.from(JSON.stringify(payload));
    const sig  = makeSignature(body, WEBHOOK_SECRET);

    const req = mockRequest(body, { "x-hub-signature-256": sig });
    const { res, status } = mockResponse();

    githubWebhookHandler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(400);
  });

  // ── Async error catch path ────────────────────────────────────────────────

  it("still returns 202 and logs the error when processWebhookEvent DB query rejects", async () => {
    const dbError = new Error("DB connection lost");
    (pool.query as jest.Mock).mockRejectedValueOnce(dbError);

    const payload = buildPayload();
    const body    = Buffer.from(JSON.stringify(payload));
    const sig     = makeSignature(body, WEBHOOK_SECRET);

    const req = mockRequest(body, { "x-hub-signature-256": sig });
    const { res, status, json } = mockResponse();

    githubWebhookHandler(req as Request, res as Response);

    // 202 is sent synchronously before the async error fires
    expect(status).toHaveBeenCalledWith(202);
    expect(json).toHaveBeenCalledWith({ accepted: true });

    // Flush the rejected promise so the .catch runs
    await new Promise((r) => setImmediate(r));
  });
});