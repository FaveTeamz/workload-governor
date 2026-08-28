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
- Add inline Rustdoc comments for every `pub fn` in the contract source. (#68)
- Add `.env.example` files for backend and frontend packages. (#70)
- Add `docs/faq.md` with answers to 10+ contributor and maintainer questions. (#69)
- Add `get_org_assignment_capacity` and `get_global_application_capacity` helper query functions.
- Add `is_org_assignment_limit_reached` and `is_global_application_limit_reached` helper query functions.
- Add Express REST API server with helmet, CORS, and morgan middleware. (#19)
- Add graceful shutdown handling with configurable timeout. (#19)
- Add Stellar Horizon API client service with exponential backoff retry logic. (#20)
- Add Soroban RPC client with transaction submission and contract data querying. (#21)
- Add structured error handling for all 11 Soroban contract error codes. (#21)
- Add GitHub issues indexing service with incremental sync from GitHub API. (#22)
- Add scheduled sync job that runs every 15 minutes to keep GitHub issues in sync. (#22)
- Add admin endpoints for manual GitHub issues sync triggering. (#22)
- Add revoke-assignment state-transition tests: org count decrement, `is_assigned` false, re-application after revoke, and `AssignmentNotFound` error. (#46)
- Add TTL expiry and extension tests for temporary storage keys with measurable ledger assertions. (#47)
- Add benchmark tests for contract function execution costs with reproducible CI command. (#48)
- Add WASM binary size documentation and release-profile optimisation settings in README. (#50)
- Add `CHANGELOG.md` and release process documentation. (#71)

---

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
