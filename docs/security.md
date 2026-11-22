# Security Policy

This document covers the SAST scanning setup, suppression policy, and how to
handle security findings in WorkloadGovernor.

---

## SAST Scanning (Semgrep)

Every pull request runs a Semgrep static analysis scan via
`.github/workflows/sast.yml`. The scan covers:

| Rule pack | Languages | Focus areas |
|---|---|---|
| `p/rust` | Rust | Memory safety, unsafe usage, injection patterns |
| `p/typescript` | TypeScript / JavaScript | Injection, prototype pollution, XSS |
| `p/nodejs` | Node.js | Path traversal, SSRF, hardcoded secrets |
| `.semgrep.yml` | TS/JS | Project-specific custom rules (see below) |

### Severity levels

| Severity | CI behaviour |
|---|---|
| `ERROR` | Fails CI — must be resolved or suppressed before merge |
| `WARNING` | Reported as PR annotations — does not fail CI |

### Viewing findings

All findings are uploaded to the **GitHub Security tab** (Security → Code
scanning alerts) as SARIF output. This includes both error and warning findings.

---

## Custom Rules

The project-specific rules in `.semgrep.yml` cover:

| Rule ID | Severity | Description |
|---|---|---|
| `no-hardcoded-secrets-ts` | ERROR | Detects secret-like variable names assigned string literals |
| `no-console-log-production` | WARNING | Flags `console.log` in non-test TypeScript files |
| `no-sql-string-concat` | ERROR | Detects SQL queries built by string concatenation |

Test files, scripts, and the frontend are excluded from certain rules where
appropriate — see `.semgrep.yml` for the full `paths.exclude` lists.

---

## Suppression Policy

### When to suppress

Suppress a finding only when **all three** conditions are met:

1. The finding is a **confirmed false positive** — the code is safe by design
   or context that Semgrep cannot infer statically.
2. Fixing it would require a **larger refactor** that is out of scope for the
   current PR, or the fix would introduce a regression.
3. The suppression is **documented** with a reason, date, and ticket reference.

Do **not** suppress findings to unblock a deadline without investigation.
Do **not** suppress findings for convenience — fix them instead.

### How to suppress

**Option A — Inline (single occurrence):**

Add `// nosemgrep: <rule-id>` on the line that triggers the finding:

```typescript
const url = process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org"; // nosemgrep: typescript.lang.security.audit.hardcoded-credentials
```

**Option B — Path-level (entire file or glob):**

Add an entry to the `suppressions` section of `.semgrep.yml`:

```yaml
suppressions:
  rule-id-here:
    - path: src/some/file.ts
      reason: >
        Explain exactly why this is a false positive and why it is safe.
      added: "YYYY-MM-DD"
      ticket: "#<issue-number>"
```

Path-level suppressions should be as narrow as possible — prefer a specific
file path over a glob.

### Reviewing suppressions

All suppressions must be reviewed in the PR that introduces them. Reviewers
should verify:

- The reason accurately describes why the finding is a false positive.
- The suppression scope (path/line) is as narrow as possible.
- The ticket reference links to a tracking issue or PR discussion.

Suppressions are audited quarterly. Stale suppressions (where the code has
changed and the finding no longer applies) must be removed.

---

## Reporting Security Vulnerabilities

Do **not** open a public GitHub issue for security vulnerabilities. Instead:

1. Email the maintainers directly (see `CODEOWNERS` for contacts).
2. Or use GitHub's private vulnerability reporting:
   **Security → Report a vulnerability**.

We aim to acknowledge reports within 2 business days and publish a fix within
30 days for critical issues.


---

## GitHub Webhook Security

### Threat model

The backend exposes `POST /api/github/webhook` to receive issue events from
GitHub. Two classes of attack are relevant:

| Threat | Vector | Mitigation |
|---|---|---|
| **Forged webhooks** | Attacker sends arbitrary POST bodies pretending to be GitHub | HMAC-SHA256 signature verification (`X-Hub-Signature-256`) |
| **Server-Side Request Forgery (SSRF)** | Payload contains a crafted URL pointing to internal infrastructure | Strict URL allowlist (host must be `api.github.com`, protocol must be `https:`) |

### HMAC-SHA256 signature verification

GitHub signs every webhook delivery with a shared secret using HMAC-SHA256.
The digest is sent in the `X-Hub-Signature-256` header as `sha256=<hex>`.

**What the handler does:**

1. The route is mounted with `express.raw({ type: 'application/json' })` so the
   raw bytes reach the handler before Express parses JSON.
2. `verifyWebhookSignature(rawBody, signature, secret)` recomputes
   `HMAC-SHA256(secret, rawBody)` and compares it with `timingSafeEqual` to
   prevent timing-based secret discovery.
3. The JSON body is parsed **only after** the signature passes. Any rejection
   before that point happens before untrusted data is interpreted.

**Configuration:**

Set the `GITHUB_WEBHOOK_SECRET` environment variable to the secret configured
in your GitHub webhook settings. The handler returns HTTP 500 and rejects all
deliveries when this variable is unset, so a misconfigured deployment fails
closed rather than open.

```
GITHUB_WEBHOOK_SECRET=<your-secret>
```

**Operational note:** Rotate the secret by updating GitHub's webhook setting and
the environment variable simultaneously. GitHub delivers both the old and new
signature for a brief overlap period — plan the rotation during low-traffic hours.

### SSRF URL allowlist

After the signature is verified, any URL present in the payload (e.g.
`issue.url`) is validated by `validateGitHubApiUrl` before it is ever fetched.

**Rules enforced:**

| Rule | Reason |
|---|---|
| Protocol must be `https:` | Blocks `http:`, `ftp:`, `file:`, `data:` URI, etc. |
| Hostname must be exactly `api.github.com` | Blocks all internal IPs and other hosts |

This blocks:

- AWS EC2/ECS instance-metadata: `169.254.169.254`, `169.254.170.2`
- Loopback: `localhost`, `127.x.x.x`, `::1`
- RFC-1918 private ranges: `10.x`, `172.16–31.x`, `192.168.x`
- Subdomain spoofing: `api.github.com.evil.com`, `evil.api.github.com`
- Protocol downgrade: `http://api.github.com`

Payloads containing a disallowed URL receive HTTP 400 before any outbound
network request is made.

### Express middleware order

Mount the webhook route **before** the global `express.json()` middleware, using
`express.raw` for the raw body:

```typescript
// app.ts — mount BEFORE express.json()
app.post(
  "/api/github/webhook",
  express.raw({ type: "application/json" }),
  githubWebhookHandler,
);

// Global JSON parser for all other routes
app.use(express.json());
```

Reversing this order causes `req.body` to be a parsed object instead of a
`Buffer`, which makes HMAC verification impossible.

### Testing

The test suite in `backend/src/__tests__/githubWebhook.test.ts` covers:

- All SSRF vectors above (AWS metadata, loopback, RFC-1918, subdomain spoofing)
- Tampered signatures and wrong secrets
- Missing and malformed `X-Hub-Signature-256` headers
- Missing `GITHUB_WEBHOOK_SECRET` environment variable
- Non-Buffer request bodies (middleware misconfiguration)
- Happy-path delivery for `opened`, `closed`, and `labeled` actions

Run the tests with:

```bash
cd backend
npm test
```
