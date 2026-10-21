# Changelog Contribution Guide

This document explains how and when to update `CHANGELOG.md`. Following these guidelines keeps the project's release history consistent and useful.

---

## The Golden Rule

> **Every user-facing change must have a changelog entry before the PR is merged.**

A *user-facing change* is anything that affects:
- Contract behaviour (function signatures, error codes, storage keys, caps)
- The REST API (new endpoints, changed request/response shapes, new error codes)
- The frontend UI (new screens, changed interactions, visual changes)
- Developer-facing tooling (new CLI commands, changed build steps, new config variables)
- Security or dependency changes that affect runtime behaviour

Internal refactors, test-only changes, CI workflow changes, and documentation-only PRs may omit a changelog entry, but adding one is never wrong.

---

## Changelog Format

`CHANGELOG.md` follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

### Structure

```markdown
## [Unreleased]

### Added
- Short present-tense description of the new capability. (#ISSUE_NUMBER)

### Changed
- What changed and how it differs from the previous behaviour. (#ISSUE_NUMBER)

### Fixed
- What bug was fixed and what the symptom was. (#ISSUE_NUMBER)

### Security
- Vulnerability description (use CVE ID if applicable). (#ISSUE_NUMBER)

### Deprecated
- What is deprecated and what to use instead. (#ISSUE_NUMBER)

### Removed
- What was removed and migration path if any. (#ISSUE_NUMBER)
```

### Section order

Use sections only when they have entries. The canonical section order is:
`Added` → `Changed` → `Deprecated` → `Removed` → `Fixed` → `Security`

### Entry style rules

- Write entries in plain English in the **imperative** (not past) tense: "Add", not "Added" or "Adds".
- Each entry is one sentence. If more context is needed, link to the PR or issue.
- Always append `(#ISSUE_NUMBER)` at the end of the entry line.
- Do not use bold/italic/code formatting inside entries unless referring to a specific identifier (e.g. function name, env var).
- Keep entries under 120 characters.

**Good:**

```markdown
### Added
- Add `extend_application_ttl` permissionless TTL refresh function. (#47)
- Add devcontainer configuration with Rust, Node.js, Stellar CLI, PostgreSQL, and Redis. (#617)
```

**Bad:**

```markdown
### Added
- Added a new function called extend_application_ttl which allows you to refresh the TTL of a pending application so that it doesn't expire.
- Devcontainer!
```

---

## Semantic Versioning Rules

This project maintains **three independently versioned components**. Each has its own version string and versioning rationale.

### Contract (Soroban WASM)

Versions follow `MAJOR.MINOR.PATCH`:

| Bump | Trigger |
|---|---|
| `MAJOR` | Breaking change to any public function signature, removal of a function, or change to an error code number |
| `MINOR` | New public function added; new read-only query added; storage key additions that are backward-compatible |
| `PATCH` | Bug fixes, gas optimisations, or refactors with no observable behaviour change |

> **Contract upgrades are not reversible on mainnet.** Every contract MAJOR bump requires a migration runbook. See [docs/runbooks/contract-upgrade.md](runbooks/contract-upgrade.md).

### Backend (Node.js REST API)

Versions follow `MAJOR.MINOR.PATCH`:

| Bump | Trigger |
|---|---|
| `MAJOR` | Breaking change to any existing REST endpoint (changed URL, removed field, changed auth scheme) |
| `MINOR` | New endpoint added; new optional response field added; new configuration variable with a safe default |
| `PATCH` | Bug fix, dependency patch, or refactor with no API contract change |

### Frontend (Vite / React)

Versions follow `MAJOR.MINOR.PATCH`:

| Bump | Trigger |
|---|---|
| `MAJOR` | Complete redesign or removal of a major user flow |
| `MINOR` | New page, new component, or new feature visible to end users |
| `PATCH` | Bug fix, style tweak, or accessibility improvement |

### Combined releases

When a single PR spans multiple components (e.g. a new contract function + a new API endpoint + a new UI), each component's version is bumped independently and the changelog groups entries by component section if the distinction matters. For simple cross-cutting features, a single version tag (`v0.2.0`) may cover all three.

---

## How to Add a Changelog Entry

### For a regular PR

1. Open `CHANGELOG.md`.
2. Find the `## [Unreleased]` section at the top.
3. Add your entry under the correct section heading (`Added`, `Changed`, `Fixed`, etc.). Create the heading if it doesn't exist.
4. Append `(#ISSUE_NUMBER)` to reference the issue or PR.
5. Commit the change in the same PR as the feature/fix.

### At release time (maintainers only)

1. Create a new version heading below `[Unreleased]`:
   ```markdown
   ## [0.2.0] - 2026-09-01
   ```
2. Move all entries from `[Unreleased]` to the new version section.
3. Leave `[Unreleased]` empty (but keep the heading).
4. Add a comparison link at the bottom of the file:
   ```markdown
   [0.2.0]: https://github.com/FaveTeamz/workload-governor/compare/v0.1.0...v0.2.0
   ```
5. Tag the commit: `git tag -a v0.2.0 -m "Release v0.2.0"`.

---

## How to Reference Issues and PRs

- Use `(#123)` to reference an issue or PR in the same repo.
- For cross-repo references: `(FaveTeamz/other-repo#45)`.
- If a change addresses multiple issues: `(#45, #46)`.
- If the change is internal with no issue, use `(internal)` — but prefer creating an issue.

---

## PR Template Reminder

The PR template (`.github/PULL_REQUEST_TEMPLATE.md`) includes a checklist item for changelog updates. If the CI `changelog-check` job fails, it means no entry was added under `[Unreleased]`. Add an entry and push to unblock the PR.

---

## What Not to Put in the Changelog

- Internal implementation details with no user-visible effect
- Test additions (unless they revealed a bug that was fixed — put the fix in `Fixed`)
- CI / workflow changes
- Dependency upgrades that don't change runtime behaviour (use `Security` for security patches)
- Formatting or whitespace-only changes
