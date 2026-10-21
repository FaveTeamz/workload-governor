# Static Analysis (Semgrep SAST)

This document covers the Semgrep static analysis setup for WorkloadGovernor:
rule inventory, local execution instructions, CI integration, adding new rules,
and the mapping of each rule category to threats in the
[security model](./security-model.md).

---

## Rule Inventory

The project ships three custom rules in `.semgrep.yml`, applied on top of three
shared Semgrep rule packs (`p/rust`, `p/typescript`, `p/nodejs`).

### Custom Rules

| Rule ID | Language | Severity | What it detects |
|---|---|---|---|
| `no-hardcoded-secrets-ts` | TypeScript / JavaScript | ERROR | `const` declarations whose variable name matches `secret`, `password`, `token`, `api_key`, `apikey`, `private_key`, or `auth` with a non-placeholder string literal value |
| `no-console-log-production` | TypeScript / JavaScript | WARNING | Bare `console.log(...)` calls in production source files |
| `no-sql-string-concat` | TypeScript / JavaScript | ERROR | `pool.query()` calls where the query string is built by `+` concatenation or a template literal containing an interpolated variable |

---

#### `no-hardcoded-secrets-ts`

**Why it matters for this codebase:** The backend manages API keys, admin
tokens, and Stellar keypair material. A hardcoded secret committed to the
repository is exposed in every clone and fork. Secrets must live in environment
variables or AWS Secrets Manager, never in source code.

**Excluded paths:** `**/*.test.ts`, `**/*.test.js`, `**/*.spec.ts`,
`**/tests/**`, `**/test/**`, `**/__tests__/**`.

**Resolution:** Move the value to an environment variable and read it at
runtime:

```typescript
// Bad
const apiToken = "sk-live-abc123";

// Good
const apiToken = process.env.API_TOKEN;
if (!apiToken) throw new Error("API_TOKEN is required");
```

---

#### `no-console-log-production`

**Why it matters for this codebase:** `console.log` bypasses the structured
logger (pino), breaking log-level filtering, JSON formatting, and centralized
log aggregation in CloudWatch. Unstructured log output can also leak internal
state (contributor addresses, issue IDs, cap counts) to anyone with log access.

**Excluded paths:** `**/*.test.ts`, `**/*.test.js`, `**/tests/**`,
`**/scripts/**`, `frontend/**`.

**Resolution:** Replace with the project logger:

```typescript
import logger from './logger';

// Bad
console.log('Sync complete', { count });

// Good
logger.info({ count }, 'Sync complete');
```

---

#### `no-sql-string-concat`

**Why it matters for this codebase:** The backend proxies contributor and
maintainer data to/from PostgreSQL. Concatenating or interpolating
user-controlled values into a query string creates a SQL injection
vulnerability. The `node-postgres` driver supports parameterized queries
natively.

**Excluded paths:** `**/*.test.ts`, `**/tests/**`.

**Resolution:** Use parameterized queries:

```typescript
// Bad
pool.query('SELECT * FROM contributors WHERE id = ' + contributorId);
pool.query(`SELECT * FROM contributors WHERE id = ${contributorId}`);

// Good
pool.query('SELECT * FROM contributors WHERE id = $1', [contributorId]);
```

---

### Shared Rule Packs

| Pack | Focus area |
|---|---|
| `p/rust` | Memory safety, `unsafe` blocks, integer overflow, and injection patterns in the Soroban contract source |
| `p/typescript` | Injection, prototype pollution, XSS, and insecure deserialization in TypeScript/JavaScript |
| `p/nodejs` | Node.js-specific vectors: path traversal, SSRF, unvalidated redirects, and command injection |

---

## Running Semgrep Locally

### Install

```bash
pip install semgrep
```

Or via Homebrew on macOS:

```bash
brew install semgrep
```

### Run all project rules

```bash
# Run only the custom project rules against the backend source
semgrep --config .semgrep.yml src/

# Mirror CI exactly — project rules + all shared packs
semgrep \
  --config .semgrep.yml \
  --config p/rust \
  --config p/typescript \
  --config p/nodejs \
  src/ backend/ frontend/src/

# Filter to ERROR-level findings only (same threshold as CI gate)
semgrep --config .semgrep.yml --severity ERROR src/

# Scan a single file
semgrep --config .semgrep.yml src/routes/orgs.ts
```

### Interpreting output

Each finding shows:

- **Rule ID** — e.g. `no-sql-string-concat`
- **File and line number**
- **Matched code snippet** — the exact lines that triggered the rule
- **Message** — explanation of the risk and how to resolve it

A clean scan prints:

```
Ran X rules on Y files: 0 findings.
```

---

## CI Integration

Semgrep runs automatically via `.github/workflows/sast.yml`.

### Trigger conditions

| Event | Branches |
|---|---|
| Pull request | targeting `main` |
| Push | to `main` |
| Manual dispatch | any branch (via GitHub Actions UI) |

### What happens on a finding

| Severity | CI effect |
|---|---|
| **ERROR** | PR is **blocked** — the `semgrep` job exits with code 1. The branch cannot be merged until the finding is resolved or a documented suppression is added to `.semgrep.yml`. |
| **WARNING** | PR is **not blocked** — warning findings are printed as job annotations and appear in the workflow log, but the job exits 0. |

### SARIF upload

Every scan — whether it passes or fails — uploads `semgrep.sarif` to the
**GitHub Security tab** (`Code scanning alerts`). This gives a persistent,
browsable view of all findings, including historical ones, even after a branch
is deleted.

### Semgrep App (optional)

If the `SEMGREP_APP_TOKEN` repository secret is set, findings are also pushed
to [semgrep.dev](https://semgrep.dev) for dashboard visibility and managed rule
management. This is optional; the CI gate works without it.

---

## Suppressions

Known false positives are documented in the `suppressions:` block at the
bottom of `.semgrep.yml`. Each suppression requires:

| Field | Description |
|---|---|
| `path` | The file or glob where the rule fires |
| `reason` | Plain-English justification for why the finding is not a real risk |
| `added` | Date added (`YYYY-MM-DD`) |
| `ticket` | GitHub issue or PR reference |

### Current suppressions

| Rule | File | Reason | Ticket |
|---|---|---|---|
| `typescript.lang.security.audit.hardcoded-credentials` | `src/horizon.ts` | `HORIZON_URL` default is the public Stellar testnet URL — not a credential | #638 |
| `javascript.lang.security.audit.ssrf` | `backend/src/health.ts` | Redis URL sourced from `process.env.REDIS_URL` (AWS Secrets Manager), not user input | #638 |
| `javascript.lang.security.audit.ssrf` | `src/services/redis.ts` | Same as above — Redis URL is env-controlled, not user-controlled | #638 |

### Inline suppression

To suppress a single line without adding a path-level entry, add a comment on
the finding line:

```typescript
// nosemgrep: javascript.lang.security.audit.ssrf
const client = new Redis(process.env.REDIS_URL);
```

Inline `nosemgrep` comments take precedence over path-level suppressions and
are the preferred approach for one-off exceptions inside otherwise clean files.

---

## Adding a New Rule

### 1. Write the rule

Add a new entry to the `rules:` block in `.semgrep.yml`:

```yaml
- id: my-new-rule
  pattern: dangerousFunction($INPUT)
  message: >
    Explain the risk and how to fix it. Be specific about the remediation step.
  languages: [typescript]
  severity: ERROR   # or WARNING
  paths:
    exclude:
      - "**/*.test.ts"
      - "**/tests/**"
```

See the [Semgrep rule syntax reference](https://semgrep.dev/docs/writing-rules/rule-syntax/)
for `patterns`, `pattern-either`, `metavariable-regex`, and other matchers.

### 2. Test the rule

Create a test file (e.g. `semgrep-tests/my-new-rule.ts`) with annotated
comments:

```typescript
// ruleid: my-new-rule
dangerousFunction(userInput);

// ok: my-new-rule
dangerousFunction('safe-literal');
```

Run the Semgrep test harness:

```bash
semgrep --test .semgrep.yml
```

All `ruleid:` lines must produce a finding; all `ok:` lines must not. The
command exits non-zero if any expectation fails.

### 3. Verify no false positives on the codebase

```bash
semgrep --config .semgrep.yml src/ backend/ frontend/src/
```

Review every new finding. If a finding is a legitimate false positive, add a
suppression entry to `.semgrep.yml` with a documented reason, date, and ticket.

### 4. PR review process

Rule changes to `.semgrep.yml` require review from a **security-aware
maintainer** (see `.github/CODEOWNERS`). The PR description must include:

- What the rule detects and why it matters for this codebase
- Test cases demonstrating true-positive detection and false-positive exclusion
- Any new suppressions with justification
- Confirmation that `semgrep --test .semgrep.yml` passes

The CI SAST job runs automatically and must pass before the PR can be merged.

---

## Relationship to Threat Model

Each rule and pack maps to one or more threats defined in
[docs/security-model.md](./security-model.md).

| Rule / Pack | Threat | Mapping |
|---|---|---|
| `no-hardcoded-secrets-ts` | Compromised Admin Key | A hardcoded secret is equivalent to a publicly exposed credential. This rule catches API keys, tokens, and private-key material before they reach the repository, directly mitigating the admin key compromise scenario. |
| `no-sql-string-concat` | Backend data integrity | The backend proxies contributor and maintainer data to PostgreSQL. SQL injection via unparameterized queries could allow data exfiltration or tampering with assignment records. Mitigates malformed-input injection at the backend layer. |
| `no-console-log-production` | Passive network observer / information leakage | Unstructured `console.log` output can expose contributor addresses, issue IDs, and internal state to anyone with log access. Enforcing the structured pino logger keeps sensitive fields out of default output and behind log-level gates. |
| `p/rust` | Contract logic integrity | Catches unsafe Rust patterns, integer overflow, and injection vectors in the Soroban contract source (`src/lib.rs`, `src/storage.rs`). Supports the contract-layer mitigations described in the security model. |
| `p/typescript` | XSS / prototype pollution / injection in API | Covers the Express REST API layer: XSS via response injection, prototype pollution via `Object.assign` with untrusted input, and insecure deserialization. |
| `p/nodejs` | Path traversal / SSRF in backend | Covers Node.js-specific attack vectors: path traversal in file operations, SSRF via user-controlled URLs passed to HTTP clients or the Redis client. |

---

## References

- [`.semgrep.yml`](../.semgrep.yml) — project rule file with custom rules and suppressions
- [`.github/workflows/sast.yml`](../.github/workflows/sast.yml) — CI workflow definition
- [Security Model](./security-model.md) — threat model, attack surfaces, and mitigations
- [Security Checklist](./security-checklist.md) — per-function authentication audit
- [Semgrep documentation](https://semgrep.dev/docs/) — rule syntax, metavariables, test format
