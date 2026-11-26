/**
 * github.ts — GitHub sync service (#312)
 *
 * Periodically fetches open issues labelled "good first issue" from every
 * registered organisation and upserts them into the local PostgreSQL database.
 *
 * Features:
 *   - Conditional requests (ETag / If-None-Match) to save API quota
 *   - Rate-limit detection (HTTP 429 + X-RateLimit-* headers) with backoff
 *   - Marks issues closed in DB when they no longer appear in the API response
 *   - Structured log per org (issue count, duration, sync status)
 *
 * SQL DIALECT COMPATIBILITY AUDIT (#861):
 *   This module targets PostgreSQL exclusively (no SQLite path). The following
 *   PostgreSQL-specific constructs are intentional and required:
 *
 *   - TIMESTAMPTZ        : timezone-aware timestamps; SQLite stores as text
 *   - TEXT[]             : native array type; SQLite has no array type
 *   - NOW()              : PostgreSQL server-side timestamp function;
 *                          Knex equivalent: knex.fn.now() — not used here
 *                          because we use raw pg pool queries, not Knex
 *   - ON CONFLICT (id) DO UPDATE : PostgreSQL upsert syntax (UPSERT);
 *                          SQLite uses INSERT OR REPLACE (different semantics)
 *   - $3::BIGINT[]       : PostgreSQL typed array cast; no SQLite equivalent
 *   - ALL($3)            : PostgreSQL array membership operator; no SQLite equivalent
 *
 *   The integration test suite (backend-integration.yml) runs against real
 *   PostgreSQL 15 and 16 containers to validate this module end-to-end.
 *   SQLite is NOT used in any test path for this module.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";
import pool from "./db.js";
import logger from "./logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GitHubIssue {
  id:          number;
  number:      number;
  title:       string;
  html_url:    string;
  state:       "open" | "closed";
  created_at:  string;
  updated_at:  string;
  labels:      Array<{ name: string }>;
  user:        { login: string } | null;
}

export interface SyncResult {
  org:        string;
  repo:       string;
  upserted:   number;
  closed:     number;
  durationMs: number;
  skipped:    boolean; // true when ETag matched (304 Not Modified)
}

// ─── Configuration ────────────────────────────────────────────────────────────

const GITHUB_TOKEN    = process.env.GITHUB_TOKEN ?? "";
const GITHUB_API_BASE = "https://api.github.com";
const SYNC_LABEL      = "good first issue";

/** Per-org ETag cache: key = "owner/repo", value = last ETag string */
const etagCache = new Map<string, string>();

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

interface GitHubApiResponse {
  status:   number;
  etag:     string | null;
  issues:   GitHubIssue[];
  resetAt:  Date | null; // X-RateLimit-Reset epoch seconds
}

/**
 * Fetch all pages of open issues for `owner/repo` with the given label.
 * Returns null if the ETag matched (304 Not Modified — data unchanged).
 * Throws on rate-limit (429) — caller should backoff and retry.
 */
async function fetchIssuesForRepo(
  owner: string,
  repo:  string,
): Promise<GitHubApiResponse> {
  const repoKey = `${owner}/${repo}`;
  const allIssues: GitHubIssue[] = [];

  const headers: Record<string, string> = {
    Accept:               "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
  };

  // ETag conditional request — only on the first page
  const cachedEtag = etagCache.get(repoKey);
  if (cachedEtag) {
    headers["If-None-Match"] = cachedEtag;
  }

  let page = 1;
  let responseEtag: string | null = null;
  let resetAt: Date | null = null;

  while (true) {
    const url = new URL(`${GITHUB_API_BASE}/repos/${owner}/${repo}/issues`);
    url.searchParams.set("state",    "open");
    url.searchParams.set("labels",   SYNC_LABEL);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page",     String(page));

    const res = await fetch(url.toString(), { headers });

    // Rate-limit hit — surface to caller for backoff
    const resetHeader = res.headers.get("x-ratelimit-reset");
    if (resetHeader) {
      resetAt = new Date(parseInt(resetHeader, 10) * 1_000);
    }

    if (res.status === 429 || res.status === 403) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      if (remaining === "0" || res.status === 429) {
        const err: NodeJS.ErrnoException = new Error(
          `GitHub rate limit hit for ${repoKey}`,
        );
        (err as unknown as Record<string, unknown>)["resetAt"] = resetAt;
        (err as unknown as Record<string, unknown>)["statusCode"] = res.status;
        throw err;
      }
    }

    // Not Modified — cached ETag still valid
    if (res.status === 304) {
      return { status: 304, etag: cachedEtag ?? null, issues: [], resetAt };
    }

    if (!res.ok) {
      throw new Error(`GitHub API error ${res.status} for ${repoKey}: ${await res.text()}`);
    }

    // Capture ETag from first page only
    if (page === 1) {
      responseEtag = res.headers.get("etag");
    }

    const data = (await res.json()) as GitHubIssue[];
    if (data.length === 0) break;

    allIssues.push(...data);

    // Check if there's a next page (Link header)
    const linkHeader = res.headers.get("link") ?? "";
    if (!linkHeader.includes('rel="next"')) break;
    page++;
  }

  if (responseEtag) {
    etagCache.set(repoKey, responseEtag);
  }

  return { status: 200, etag: responseEtag, issues: allIssues, resetAt };
}

// ─── Database helpers ─────────────────────────────────────────────────────────

/**
 * Ensure the issues table exists. Idempotent — safe to call on every sync.
 */
export async function ensureSchema(): Promise<void> {
  await pool.query(/* sql */ `
    CREATE TABLE IF NOT EXISTS github_issues (
      id          BIGINT PRIMARY KEY,     -- GitHub issue id
      owner       TEXT NOT NULL,
      repo        TEXT NOT NULL,
      number      INTEGER NOT NULL,
      title       TEXT NOT NULL,
      html_url    TEXT NOT NULL,
      state       TEXT NOT NULL DEFAULT 'open',
      labels      TEXT[] NOT NULL DEFAULT '{}',
      author      TEXT,
      created_at  TIMESTAMPTZ NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL,
      synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS github_issues_owner_repo_idx
      ON github_issues (owner, repo);
    CREATE INDEX IF NOT EXISTS github_issues_state_idx
      ON github_issues (state);
  `);
}

/**
 * Upsert a batch of open issues and mark any previously-open issues that are
 * no longer in the API response as closed.
 *
 * Returns { upserted, closed }.
 */
async function syncIssuesToDb(
  owner:  string,
  repo:   string,
  issues: GitHubIssue[],
): Promise<{ upserted: number; closed: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Upsert all issues returned by the API
    let upserted = 0;
    for (const issue of issues) {
      await client.query(
        /* sql */ `
        INSERT INTO github_issues
          (id, owner, repo, number, title, html_url, state, labels, author, created_at, updated_at, synced_at)
        VALUES
          ($1, $2, $3, $4, $5, $6, 'open', $7, $8, $9, $10, NOW())
        ON CONFLICT (id) DO UPDATE SET
          title      = EXCLUDED.title,
          html_url   = EXCLUDED.html_url,
          state      = 'open',
          labels     = EXCLUDED.labels,
          author     = EXCLUDED.author,
          updated_at = EXCLUDED.updated_at,
          synced_at  = NOW()
        `,
        [
          issue.id,
          owner,
          repo,
          issue.number,
          issue.title,
          issue.html_url,
          issue.labels.map((l) => l.name),
          issue.user?.login ?? null,
          issue.created_at,
          issue.updated_at,
        ],
      );
      upserted++;
    }

    // Mark issues no longer present in the API response as closed
    const openIds = issues.map((i) => i.id);
    const closeResult = await client.query(
      /* sql */ `
      UPDATE github_issues
      SET state = 'closed', synced_at = NOW()
      WHERE owner = $1
        AND repo  = $2
        AND state = 'open'
        AND ($3::BIGINT[] IS NULL OR id <> ALL($3))
      `,
      [owner, repo, openIds.length > 0 ? openIds : null],
    );

    await client.query("COMMIT");
    return { upserted, closed: closeResult.rowCount ?? 0 };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Registered orgs ──────────────────────────────────────────────────────────

/**
 * Load the list of {owner, repo} pairs to sync from the database.
 * Falls back to the SYNC_REPOS env var (comma-separated "owner/repo" pairs)
 * so the service can run without a database for local dev.
 */
async function loadRegisteredRepos(): Promise<Array<{ owner: string; repo: string }>> {
  // Try DB first
  try {
    const res = await pool.query<{ owner: string; repo: string }>(
      "SELECT DISTINCT owner, repo FROM registered_repos WHERE enabled = TRUE",
    );
    if (res.rowCount && res.rowCount > 0) return res.rows;
  } catch {
    // Table may not exist yet — fall through to env var
  }

  // Fallback to env var
  const raw = process.env.SYNC_REPOS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const [owner, repo] = pair.split("/");
      return { owner: owner ?? pair, repo: repo ?? "" };
    })
    .filter((r) => r.owner && r.repo);
}

// ─── Backoff helper ───────────────────────────────────────────────────────────

async function waitUntil(target: Date): Promise<void> {
  const delay = Math.max(0, target.getTime() - Date.now()) + 5_000; // +5s buffer
  logger.warn({ resumeAt: target.toISOString() }, `Rate limited — sleeping ${delay}ms`);
  await new Promise((r) => setTimeout(r, delay));
}

// ─── Core sync function ───────────────────────────────────────────────────────

/**
 * Run a full sync for a single owner/repo.
 * Retries once on rate-limit (429) after waiting for X-RateLimit-Reset.
 */
async function syncRepo(owner: string, repo: string): Promise<SyncResult> {
  const start = Date.now();

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const apiResponse = await fetchIssuesForRepo(owner, repo);

      if (apiResponse.status === 304) {
        const durationMs = Date.now() - start;
        logger.info({ org: owner, repo, durationMs, skipped: true }, "GitHub sync skipped (ETag match)");
        return { org: owner, repo, upserted: 0, closed: 0, durationMs, skipped: true };
      }

      const { upserted, closed } = await syncIssuesToDb(owner, repo, apiResponse.issues);
      const durationMs = Date.now() - start;

      logger.info(
        { org: owner, repo, issueCount: apiResponse.issues.length, upserted, closed, durationMs },
        "GitHub sync complete",
      );
      return { org: owner, repo, upserted, closed, durationMs, skipped: false };

    } catch (err: unknown) {
      const errRecord = err as Record<string, unknown>;
      if (errRecord["statusCode"] === 429 || errRecord["statusCode"] === 403) {
        if (attempt === 1 && errRecord["resetAt"] instanceof Date) {
          await waitUntil(errRecord["resetAt"]);
          continue; // retry
        }
      }
      throw err;
    }
  }

  throw new Error(`syncRepo(${owner}/${repo}) exceeded retry budget`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run a full sync across all registered repositories.
 * Each repo is processed sequentially to avoid hammering the GitHub API.
 * Errors on individual repos are logged and do not abort the run.
 */
export async function runFullSync(): Promise<SyncResult[]> {
  await ensureSchema();

  const repos = await loadRegisteredRepos();
  if (repos.length === 0) {
    logger.warn("No repositories configured for sync — set SYNC_REPOS or populate registered_repos table");
    return [];
  }

  const results: SyncResult[] = [];
  for (const { owner, repo } of repos) {
    try {
      const result = await syncRepo(owner, repo);
      results.push(result);
    } catch (err) {
      logger.error({ err, org: owner, repo }, "GitHub sync failed for repo");
    }
  }
  return results;
}

// ─── Webhook security ─────────────────────────────────────────────────────────

/**
 * Validate that a URL received in a webhook payload is safe to fetch.
 *
 * Rules enforced:
 *   - Protocol must be `https:`
 *   - Hostname must be exactly `api.github.com`
 *
 * This blocks SSRF vectors including:
 *   - AWS EC2/ECS instance-metadata (169.254.169.254, fd00:ec2::254)
 *   - Loopback (localhost, 127.x.x.x, ::1)
 *   - RFC-1918 private ranges (10.x, 172.16-31.x, 192.168.x)
 *   - Other cloud metadata endpoints
 *
 * Returns the parsed `URL` object on success; throws `Error` on any violation.
 */
export function validateGitHubApiUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`Only HTTPS protocol allowed, got: ${parsed.protocol}`);
  }

  if (parsed.hostname !== "api.github.com") {
    throw new Error(`Target host must be api.github.com, got: ${parsed.hostname}`);
  }

  return parsed;
}

/**
 * Verify the GitHub webhook HMAC-SHA256 signature.
 *
 * GitHub signs the raw request body with the shared webhook secret and sends
 * the digest in the `X-Hub-Signature-256` header as `sha256=<hex>`.
 *
 * Uses `timingSafeEqual` to prevent timing-based secret discovery.
 *
 * @param rawBody   - The raw request body bytes (Buffer from `express.raw`).
 * @param signature - The full header value, e.g. `"sha256=abc123..."`.
 * @param secret    - The webhook secret configured in GitHub.
 * @returns `true` when the signature is valid; `false` otherwise.
 */
export function verifyWebhookSignature(
  rawBody:   Buffer,
  signature: string,
  secret:    string,
): boolean {
  if (!signature.startsWith("sha256=")) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const provided = signature.slice("sha256=".length);

  // Both buffers must be the same length for timingSafeEqual
  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(provided, "hex"),
  );
}

// ─── Webhook event types ──────────────────────────────────────────────────────

export interface WebhookIssuePayload {
  action: string;
  issue: {
    id:       number;
    number:   number;
    title:    string;
    html_url: string;
    state:    string;
    url:      string;
  };
  repository: {
    name:      string;
    full_name: string;
    owner: { login: string };
  };
}

// ─── Express handler ──────────────────────────────────────────────────────────

/**
 * POST /api/github/webhook
 *
 * Processes incoming GitHub issue webhook events.
 *
 * Security model:
 *   1. HMAC-SHA256 signature (X-Hub-Signature-256) verified BEFORE the JSON
 *      body is parsed or any URL in the payload is inspected.
 *   2. Any URL present in the payload is validated against the strict allowlist
 *      (api.github.com / HTTPS only) before it is ever fetched.
 *
 * Mount this handler AFTER `express.raw({ type: 'application/json' })` so the
 * raw bytes are available on `req.body` for HMAC verification.
 */
export function githubWebhookHandler(req: Request, res: Response): void {
  // ── 1. Signature verification ────────────────────────────────────────────
  const signature = req.headers["x-hub-signature-256"];
  if (typeof signature !== "string" || !signature) {
    logger.warn("Webhook rejected: missing X-Hub-Signature-256 header");
    res.status(401).json({ error: "Missing webhook signature" });
    return;
  }

  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET ?? "";
  if (!webhookSecret) {
    logger.error("GITHUB_WEBHOOK_SECRET is not configured — rejecting all webhooks");
    res.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  const rawBody = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody)) {
    logger.warn("Webhook rejected: body is not a Buffer (check express.raw middleware)");
    res.status(400).json({ error: "Invalid request body encoding" });
    return;
  }

  if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    logger.warn("Webhook rejected: invalid HMAC signature");
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  // ── 2. Parse JSON payload (only after signature is verified) ─────────────
  let payload: WebhookIssuePayload;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as WebhookIssuePayload;
  } catch {
    logger.warn("Webhook rejected: malformed JSON body");
    res.status(400).json({ error: "Malformed JSON payload" });
    return;
  }

  // ── 3. Validate every URL in the payload before it can be fetched ─────────
  try {
    validateGitHubApiUrl(payload.issue.url);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ url: payload.issue.url }, `Webhook rejected: unsafe issue URL — ${msg}`);
    res.status(400).json({ error: `Unsafe URL in payload: ${msg}` });
    return;
  }

  // ── 4. Dispatch on action ─────────────────────────────────────────────────
  const { action, issue, repository } = payload;
  const owner = repository.owner.login;
  const repo  = repository.name;

  logger.info({ action, owner, repo, issueNumber: issue.number }, "GitHub webhook received");

  // Async processing — errors are logged but do not alter the 202 response
  // because GitHub retries on non-2xx responses, which could loop.
  void processWebhookEvent(action, owner, repo, issue).catch((err: unknown) => {
    logger.error({ err, action, owner, repo, issueNumber: issue.number }, "Webhook processing error");
  });

  res.status(202).json({ accepted: true });
}

/**
 * Persist the webhook event to the database.
 * Called asynchronously — network or DB errors are caught by the caller.
 */
async function processWebhookEvent(
  action:  string,
  owner:   string,
  repo:    string,
  issue:   WebhookIssuePayload["issue"],
): Promise<void> {
  if (action === "opened" || action === "reopened") {
    await pool.query(
      /* sql */ `
      INSERT INTO github_issues
        (id, owner, repo, number, title, html_url, state, labels, author, created_at, updated_at, synced_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'open', '{}', NULL, NOW(), NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        title      = EXCLUDED.title,
        html_url   = EXCLUDED.html_url,
        state      = 'open',
        updated_at = NOW(),
        synced_at  = NOW()
      `,
      [issue.id, owner, repo, issue.number, issue.title, issue.html_url],
    );
  } else if (action === "closed") {
    await pool.query(
      /* sql */ `
      UPDATE github_issues
      SET state = 'closed', synced_at = NOW()
      WHERE id = $1
      `,
      [issue.id],
    );
  }
  // Other actions (labeled, unlabeled, etc.) are intentionally ignored.
}
