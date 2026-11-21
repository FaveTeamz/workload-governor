# Dependency Management

This document describes the automated dependency update policy for WorkloadGovernor.

## Overview

Dependency updates are automated via **GitHub Dependabot** across three package ecosystems:

| Ecosystem | Manifest | Schedule |
|-----------|----------|----------|
| Rust / Cargo | `/Cargo.toml` | Weekly, Monday 08:00 UTC |
| Node / npm | `/frontend/package.json` | Weekly, Monday 08:00 UTC |
| GitHub Actions | `/.github/workflows/*.yml` | Weekly, Monday 08:00 UTC |

Configuration lives in [`.github/dependabot.yml`](../.github/dependabot.yml).

---

## PR Flood Protection

Each ecosystem is capped at **5 open Dependabot PRs** at a time (`open-pull-requests-limit: 5`). Once the cap is reached, Dependabot will not open more PRs until some are merged or closed. Merge or close older PRs first if you need newer updates to flow through.

---

## Auto-merge Policy

Patch-level updates that pass CI are eligible for auto-merge. To enable auto-merge on a Dependabot PR:

```bash
# After the PR is opened and CI is green
gh pr merge <PR_NUMBER> --auto --squash
```

Or configure repository branch protection rules to allow auto-merge for `dependabot[bot]` when all required checks pass.

**Scope of auto-merge:**
- ✅ Patch updates (`x.y.Z`) for all ecosystems
- ✅ `github-actions` digest pin bumps
- ⚠️ Minor updates (`x.Y.z`) require manual review
- ❌ Major updates (`X.y.z`) always require manual review

**Special case — `soroban-sdk`:** Minor and major version bumps are intentionally ignored in Dependabot config. `soroban-sdk` version changes must be tested against the Stellar testnet before merging (see [contract upgrade runbook](runbooks/contract-upgrade.md)).

---

## Reviewing Dependency PRs

1. Check the Dependabot PR description — it links to the changelog and any known CVEs.
2. Confirm CI passes (build, test, lint).
3. For Rust updates, run `cargo test --features testutils` locally if the diff touches core crates.
4. For frontend updates, run `npm test` and `npm run build` in `frontend/`.
5. Approve and merge (or enable auto-merge for patches).

---

## Ignoring a Dependency or Version Range

Add an `ignore` block in `.github/dependabot.yml`:

```yaml
updates:
  - package-ecosystem: "cargo"
    directory: "/"
    # ...
    ignore:
      - dependency-name: "some-crate"
        versions: ["1.x", "2.x"]
      - dependency-name: "another-crate"
        update-types: ["version-update:semver-major"]
```

To ignore a single update from a Dependabot PR comment, use:

```
@dependabot ignore this minor version
@dependabot ignore this major version
@dependabot ignore this dependency
```

---

## Security Advisories

Dependabot also monitors the **GitHub Advisory Database** and opens security PRs immediately (not on the weekly schedule) when a dependency has a known CVE. These PRs are labelled `security` and should be prioritised.

For Rust, `cargo audit` is also run in CI (see `.github/workflows/contract-ci.yml`) to catch advisories on every push.

---

## Manual Audit

Run the following commands to check for vulnerabilities outside of CI:

```bash
# Rust
cargo install cargo-audit --locked
cargo audit

# Node
cd frontend
npm audit
npm audit fix   # auto-fix compatible patches
```

---

## Related Documents

- [CODEOWNERS](../.github/CODEOWNERS) — review assignment configuration
- [Contract upgrade runbook](runbooks/contract-upgrade.md) — special steps for soroban-sdk upgrades
- [Security checklist](security-checklist.md) — broader security practices
