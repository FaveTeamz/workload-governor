# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Inline Rustdoc comments for every `pub fn` in the contract source (#68).
- `.env.example` files for backend and frontend packages (#70).
- This `CHANGELOG.md` and the release process documentation (#71).
- `docs/faq.md` with answers to 10+ contributor and maintainer questions (#69).
- `get_org_assignment_capacity` and `get_global_application_capacity` helper functions.
- `is_org_assignment_limit_reached` and `is_global_application_limit_reached` helper functions.
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
