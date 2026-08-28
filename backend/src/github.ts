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
 */

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
