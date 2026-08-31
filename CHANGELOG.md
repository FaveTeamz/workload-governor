# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For guidelines on writing changelog entries see [docs/changelog-guide.md](docs/changelog-guide.md).

## [Unreleased]

---

## [0.3.0] - 2026-08-28

### Added
- Add `.devcontainer/devcontainer.json` with Rust (stable + `wasm32v1-none`), Node.js 20 LTS, Stellar CLI, PostgreSQL, and Redis pre-installed. (#617)
- Add `.devcontainer/post-create.sh` to automate dependency installation and `.env` scaffolding on first container start. (#617)
- Add Windows-specific setup notes (WSL 2, line endings, file-system placement) to `docs/local-dev-guide.md`. (#617)
- Add environment variables reference table to `docs/local-dev-guide.md`. (#617)
- Add two new troubleshooting items to `docs/local-dev-guide.md`: devcontainer build failures and npm permission errors. (#617)
- Add 8 Soroban-specific glossary entries: Footprint, Temporary vs Persistent Storage, TTL, Ledger Entry / Ledger Sequence, Invocation, WASM Hash / Contract WASM, Simulation vs Submission, Authorization Envelope. (#615)
- Add `docs/org-onboarding-guide.md` with a 7-step onboarding guide, org checklist, and support/escalation table. (#616)
- Add `docs/changelog-guide.md` documenting entry format, semantic versioning rules for contract/backend/frontend, and PR process. (#614)

### Changed
- Rewrite `docs/local-dev-guide.md` to use the devcontainer as the primary setup path; manual setup is now the secondary path. (#617)
- Update `docs/stellar-primer.md` to add a glossary callout, inline cross-links on storage tiers and contract invocations, and two new Further Reading rows. (#615)
- Update `INTEGRATION_GUIDE.md` to add a new-org callout at the top and a Related Documentation section at the bottom. (#616)

---

## [0.2.0] - 2026-07-15

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
- **#607 Comprehensive contributor onboarding guide**: Expanded `docs/contributor-guide.md`
  with full prerequisites (Rust, Node.js, Stellar CLI, Docker versions), 5-minute local
  dev setup, all test suite commands, the complete apply → assign → complete workflow with
  CLI examples, TTL extension guidance, 10-item troubleshooting section covering the top
  reported local setup errors, fuzz testing quick-start (cross-linked to README), corpus
  generation, and a complete worked testnet example. Updated `CONTRIBUTING.md` to
  cross-link to the contributor guide and document the release process, semver convention,
  API spec validation, and frontend development rules.
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
- Add initial WorkloadGovernor Soroban smart contract.
- Add global application cap: max 15 pending applications per contributor across all orgs.
- Add per-org assignment cap: max 4 active assignments per contributor per organisation.
- Add `initialize`, `register_maintainer`, and `upgrade` admin functions.
- Add `apply_for_issue` and `withdraw_application` contributor functions.
- Add `assign_issue`, `complete_assignment`, and `revoke_assignment` maintainer functions.
- Add `extend_application_ttl` permissionless TTL refresh function.
- Add read-only query functions: `get_global_application_count`, `get_org_assignment_count`, `has_applied`, `is_assigned`.
- Add temporary storage for applications (wave-bounded TTL ≈ 24 h).
- Add persistent storage for admin, maintainers, and assignments.
- Add full unit and property-based test suite.
- Add GitHub Actions CI workflow.
- Add Docker Compose setup for local development.
- Add AWS infrastructure (RDS, ECS, CloudWatch, Secrets Manager) Terraform definitions.

[Unreleased]: https://github.com/FaveTeamz/workload-governor/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/FaveTeamz/workload-governor/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/FaveTeamz/workload-governor/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/FaveTeamz/workload-governor/releases/tag/v0.1.0
