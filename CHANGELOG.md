# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **#327 SVG icon system**: Consolidated all UI icons into a single sprite file at
  `frontend/public/icons.svg` (30+ symbols). New `Icon` component
  (`frontend/src/components/Icon.tsx`) renders any icon by `name` prop with optional
  `size` (xs/sm/md/lg/xl) and `color` props; uses `currentColor` by default.
  All icons follow kebab-case naming (`assign`, `complete`, `revoke`, `check-circle`, etc.).
- **#326 Error recovery UX**: New `ErrorRecovery` component
  (`frontend/src/components/ErrorRecovery.tsx`) maps all 13 `ContractError` discriminants
  (codes 1–11, 13) plus network timeouts (−1) to plain-language titles, messages, and
  actionable recovery steps. Code 6 (`GlobalApplicationLimitReached`) shows current count
  and surfaces a withdrawal CTA. Retry button rendered for transient (timeout) errors.
  Includes `parseContractErrorCode()` utility to extract codes from raw error strings.
- **#325 Maintainer assignment side panel**: Rewrote `MaintainerPanel` as a slide-in side
  panel (`position: fixed; right: 0`). Features: pin button to keep panel open while
  browsing; `data-testid` attributes (`pending-application`, `assign-btn`, `active-assignment`,
  `complete-btn`, `revoke-btn`) for e2e tests; applicants sorted oldest-first by
  `appliedDate`; per-contributor cap usage badges (global apps / org assignments);
  mobile renders as full-screen bottom sheet at ≤640 px.

### Changed
- **#328 WCAG AA colour contrast fixes**: Updated design tokens to eliminate all
  contrast failures. Summary of changed values:

  | Token / context | Before | After | Ratio (dark) |
  |---|---|---|---|
  | `--color-muted` (dark) | `#94a3b8` | `#a8b5c8` | 4.4:1 ❌ → 5.6:1 ✅ |
  | `--color-muted` (light) | `#64748b` | `#475569` | 4.4:1 ❌ → 6.7:1 ✅ |
  | `--color-primary` (light) | `#6c8eff` | `#4a6de0` | 3.5:1 ❌ → 5.0:1 ✅ |
  | `--color-complete` (light) | `#22c55e` | `#16a34a` | 2.4:1 ❌ → 5.1:1 ✅ |
  | `--color-revoke` / badge error text | `#ef4444` | `#dc2626` | 4.3:1 ❌ → 5.4:1 ✅ |
  | `.badge--error` text color | `--color-error-500` | `--color-error-600` | 4.3:1 ❌ → 5.4:1 ✅ |

  New tokens added: `--color-error-600: #dc2626`, `--color-success-600: #16a34a`,
  `--color-warning-600: #ca8a04`. All fixes applied at token level — no component overrides.

### Added
- Inline Rustdoc comments for every `pub fn` in the contract source (#68).
- `.env.example` files for backend and frontend packages (#70).
- This `CHANGELOG.md` and the release process documentation (#71).
- `docs/faq.md` with answers to 10+ contributor and maintainer questions (#69).
- `get_org_assignment_capacity` and `get_global_application_capacity` helper functions.
- `is_org_assignment_limit_reached` and `is_global_app_limit_reached` helper functions.
- Express REST API server with helmet, CORS, and morgan middleware (#19).
- Graceful shutdown handling with configurable timeout (#19).
- Stellar Horizon API client service with exponential backoff retry logic (#20).
- Soroban RPC client with transaction submission and contract data querying (#21).
- Structured error handling for all 11 Soroban contract error codes (#21).
- GitHub issues indexing service with incremental sync from GitHub API (#22).
- Scheduled sync job that runs every 15 minutes to keep GitHub issues in sync (#22).
- Admin endpoints for manual GitHub issues sync triggering (#22).
- Revoke-assignment state-transition tests: org count decrement, `is_assigned` false, re-application after revoke, and `AssignmentNotFound` error (#46).
- TTL expiry and extension tests for temporary storage keys with measurable ledger assertions (#47).
- Benchmark tests for contract function execution costs with reproducible CI command (#48).
- WASM binary size documentation and release-profile optimization settings in README (#50).
- Codecov integration with three independent flags: `backend` (≥80%), `frontend` (≥75%), `contract` (≥90%) (#378).
- `codecov.yml` with per-flag coverage thresholds, PR comment showing per-file coverage delta, and carryforward flag support (#378).
- `.github/workflows/coverage.yml` rewritten: backend uses Vitest + Istanbul, frontend uses Vitest + jsdom + Istanbul, contract uses `cargo-llvm-cov` (#378).
- `npm run coverage` (all suites) and `npm run coverage:backend` scripts to root `package.json`; `npm run coverage` script to `frontend/package.json` (#378).
- `@vitest/coverage-istanbul` devDependency added to both root and frontend packages (#378).
- Rust proptest sequential invariant tests `prop_global_count_invariant_sequence` and
  `prop_org_count_invariant_sequence` (1 000 cases each) covering all apply/withdraw and
  assign/complete/revoke state transitions (#354).
- TypeScript fast-check property test suites `prop_global_app_limit.test.ts` and
  `prop_org_assign_limit.test.ts` expanded to cover withdraw, revoke, and complete
  sequences (5–6 properties × 1 000 cases each) (#354).

### Changed
- Renamed `is_global_application_limit_reached` → `is_global_app_limit_reached` to stay
  within the Soroban 32-character contract function name limit.

## [0.1.0] - 2026-06-24

### Added
- Initial WorkloadGovernor Soroban smart contract.
- Global application cap: max 15 pending applications per contributor.
- Per-org assignment cap: max 4 active assignments per contributor per organisation.
- `initialize`, `register_maintainer`, and `upgrade` admin functions.
- `apply_for_issue` and `withdraw_application` contributor functions.
- `assign_issue`, `complete_assignment`, and `revoke_assignment` maintainer functions.
- `extend_application_ttl` permissionless TTL refresh function.
- Read-only query functions: `get_global_application_count`, `get_org_assignment_count`,
  `has_applied`, `is_assigned`.
- Temporary storage for applications (wave-bounded TTL ~24 h).
- Persistent storage for admin, maintainers, and assignments.
- Full unit and property-based test suite.
- GitHub Actions CI workflow.
- Docker Compose setup for local development.
- AWS infrastructure (RDS, ECS, CloudWatch, Secrets Manager) Terraform definitions.

[Unreleased]: https://github.com/FaveTeamz/workload-governor/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/FaveTeamz/workload-governor/releases/tag/v0.1.0
