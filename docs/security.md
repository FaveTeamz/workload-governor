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
