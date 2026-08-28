# WorkloadGovernor

[![codecov](https://codecov.io/gh/FaveTeamz/workload-governor/branch/main/graph/badge.svg?token=CODECOV_TOKEN)](https://codecov.io/gh/FaveTeamz/workload-governor)
[![Backend Coverage](https://codecov.io/gh/FaveTeamz/workload-governor/branch/main/graph/badge.svg?flag=backend)](https://codecov.io/gh/FaveTeamz/workload-governor)
[![Frontend Coverage](https://codecov.io/gh/FaveTeamz/workload-governor/branch/main/graph/badge.svg?flag=frontend)](https://codecov.io/gh/FaveTeamz/workload-governor)
[![Contract Coverage](https://codecov.io/gh/FaveTeamz/workload-governor/branch/main/graph/badge.svg?flag=contract)](https://codecov.io/gh/FaveTeamz/workload-governor)
![Mutation Score](https://img.shields.io/badge/mutation%20score-75%25-orange)

A production-ready Soroban smart contract for the **AlignmentDrips Wave** platform on the Stellar network.

## Purpose

WorkloadGovernor enforces structural fairness caps on developer workloads across open-source organizations:

- **Global cap**: max 15 pending applications per contributor across all orgs
- **Org cap**: max 4 active assignments per contributor per organization

This prevents a small group of faster developers from monopolizing open-source tasks.

## Contract Functions

| Function | Caller | Description |
|---|---|---|
| `initialize(admin)` | Admin | One-time contract setup |
| `register_maintainer(admin, maintainer, org_id)` | Admin | Authorize a maintainer for an org |
| `deregister_maintainer(admin, maintainer, org_id)` | Admin | Revoke a maintainer's authorization for an org |
| `upgrade(new_wasm_hash)` | Admin | Upgrade the contract WASM |
| `apply_for_issue(contributor, org_id, issue_id)` | Contributor | Submit a pending application |
| `withdraw_application(contributor, org_id, issue_id)` | Contributor | Cancel a pending application |
| `assign_issue(maintainer, contributor, org_id, issue_id)` | Maintainer | Convert application to assignment |
| `complete_assignment(maintainer, contributor, org_id, issue_id)` | Maintainer | Mark assignment completed |
| `revoke_assignment(maintainer, contributor, org_id, issue_id)` | Maintainer | Cancel an active assignment |
| `extend_application_ttl(contributor, org_id, issue_id)` | Anyone | Bump TTL for a pending application |
| `get_global_application_count(contributor)` | Anyone | Query global app count |
| `get_org_assignment_count(contributor, org_id)` | Anyone | Query org assignment count |
| `has_applied(contributor, org_id, issue_id)` | Anyone | Check if application exists |
| `is_assigned(contributor, org_id, issue_id)` | Anyone | Check if assignment is active |
| `check_consistency(pairs, issue_ids)` | Anyone | Return `(contributor, org_id)` pairs with counter inconsistency |
| `check_consistency(pairs, issue_ids)` | Anyone | Return (contributor, org_id) pairs with counter inconsistency |

## Error Codes

| Code | Variant | Trigger |
|---|---|---|
| 1 | `AlreadyInitialized` | `initialize` called twice |
| 2 | `NotInitialized` | State-changing call before `initialize` |
| 3 | `UnauthorizedAdmin` | Wrong admin credentials |
| 4 | `UnauthorizedMaintainer` | Maintainer not registered for org |
| 5 | `UnauthorizedContributor` | Auth failure on contributor call |
| 6 | `GlobalApplicationLimitReached` | Contributor has 15 pending applications |
| 7 | `OrgAssignmentLimitReached` | Contributor has 4 active assignments in org |
| 8 | `DuplicateApplication` | Same (contributor, org, issue) applied twice |
| 9 | `ApplicationNotFound` | Application does not exist |
| 10 | `AssignmentNotFound` | Assignment does not exist |
| 11 | `AlreadyAssigned` | Issue already has an active assignment |
| 17 | `MaintainerNotFound` | Maintainer not registered for the org (returned by `deregister_maintainer`) |

## Storage Design

| Category | Tier | Key | Value |
|---|---|---|---|
| Global App Count | Temporary (Wave TTL) | `("g_apps", contributor)` | `u32` |
| App Entry | Temporary (Wave TTL) | `("app", contributor, org_id, issue_id)` | `bool` |
| Admin | Persistent | `"admin"` | `Address` |
| Maintainer | Persistent | `("maint", maintainer, org_id)` | `bool` |
| Org Assignment Count | Persistent | `("o_asgn", contributor, org_id)` | `u32` |
| Assignment Entry | Persistent | `("asgn", org_id, issue_id, contributor)` | `bool` |
| Org Assignment Cap | Persistent | `("o_cap", org_id)` | `u32` |

All six key prefixes are distinct — zero key collision guarantee.

## Documentation

| Document | Description |
|---|---|
| [docs/admin-guide.md](docs/admin-guide.md) | Admin operational procedures: initialisation, maintainer onboarding/offboarding, upgrades |
| [docs/storage-design.md](docs/storage-design.md) | Storage key patterns, TTL semantics, and collision-free proof |
| [docs/error-reference.md](docs/error-reference.md) | All error codes with causes, resolutions, and example scenarios |
| [docs/api-reference.md](docs/api-reference.md) | Complete REST API reference with request/response examples |
| [docs/runbooks/admin-key-rotation.md](docs/runbooks/admin-key-rotation.md) | Emergency admin key rotation procedure |

## Operations

Step-by-step operator runbooks for production scenarios:

| Runbook | Description |
|---|---|
| [docs/runbooks/contract-upgrade.md](docs/runbooks/contract-upgrade.md) | Build, optimize, upload WASM, call `upgrade` |
| [docs/runbooks/admin-key-rotation.md](docs/runbooks/admin-key-rotation.md) | Two-step admin key transfer procedure |
| [docs/runbooks/cap-emergency-increase.md](docs/runbooks/cap-emergency-increase.md) | Governance vote + contract upgrade to raise contributor caps |
| [docs/runbooks/incident-response.md](docs/runbooks/incident-response.md) | What to do when a bug is found post-deploy (freeze strategy included) |

## Building

```bash
# Install the Stellar CLI and wasm32v1-none target
rustup target add wasm32v1-none

# Build the WASM
stellar contract build

# Or manually
cargo build --target wasm32v1-none --release

# Optimize (required before mainnet deployment)
stellar contract optimize --wasm target/wasm32v1-none/release/workload_governor.wasm
```

### Binary Size

| Build | Size |
|---|---|
| Unoptimized (`cargo build --release`) | ~28 KB |
| Optimized (`stellar contract optimize`) | < 20 KB (target) |

The release profile is pre-configured with `opt-level = 'z'` and `lto = true` in `Cargo.toml` to meet the 64 KB contract size limit.

## Testing

```bash
# All tests (unit + property-based)
cargo test --features testutils

# Property-based tests only
cargo test --features testutils prop_

# Unit tests only
cargo test --features testutils unit_
```

## Fuzz Testing

Fuzz targets live in `fuzz/fuzz_targets/` and require a nightly Rust toolchain plus `cargo-fuzz`.

```bash
# Install cargo-fuzz (nightly required)
rustup install nightly
cargo install cargo-fuzz --locked

# Build all fuzz targets
cargo +nightly fuzz build

# Run a target for 10 minutes
cargo +nightly fuzz run fuzz_apply      -- -max_total_time=600
cargo +nightly fuzz run fuzz_assign     -- -max_total_time=600
cargo +nightly fuzz run fuzz_batch_apply -- -max_total_time=600

# Run with pre-seeded corpus
cargo +nightly fuzz run fuzz_apply fuzz/corpus/fuzz_apply -- -max_total_time=600
```

| Target | Description |
|---|---|
| `fuzz_apply` | Random `contributor`, `org_id`, `issue_id` → `apply_for_issue` |
| `fuzz_assign` | Random inputs → `assign_issue`, `complete_assignment`, `revoke_assignment` |
| `fuzz_batch_apply` | Vec of random `issue_id`s applied in batch, enforces ≤15 global cap |

Any corpus inputs that triggered bugs are committed to `fuzz/corpus/`.

### Corpus Generation

Hand-crafted seed inputs covering known edge cases (u32::MAX issue IDs, max-length org symbols, duplicate detection, cap boundaries) are committed to `fuzz/corpus/`. To regenerate them:

```bash
python3 scripts/generate-corpus.py          # writes to fuzz/corpus/
python3 scripts/generate-corpus.py --corpus-dir /tmp/fresh-corpus   # custom dir
```

The script is idempotent — re-running overwrites existing seeds with the canonical values and leaves any fuzzer-discovered inputs untouched.

## Mutation Testing

[cargo-mutants](https://mutants.rs) is used to verify that the test suite catches logic errors in the contract.

```bash
# Install cargo-mutants
cargo install cargo-mutants --locked

# Run against contract source (takes several minutes)
cargo mutants --features testutils -- src/lib.rs

# Generate the HTML + text report
node scripts/mutation-report.js mutants.out/
# text-only summary:
node scripts/mutation-report.js --text-only
# enforce 90% threshold (exits non-zero if below):
node scripts/mutation-report.js --threshold=90 --text-only
```

The mutation score badge in this README reflects the last recorded run. After adding or changing tests, re-run `cargo mutants` and update `mutants.out/` to refresh the badge.

| File | Recorded score | Target |
|---|---|---|
| `src/lib.rs` | 75% (21/28 caught) | ≥ 90% |

## Benchmarking

```bash
# Run benchmark tests (prints CPU/memory usage to stdout)
cargo test --features testutils bench_

# Capture output for documentation
cargo test --features testutils bench_ 2>&1 | tee benchmarks.txt
```

## Deploying

```bash
# Deploy to testnet
stellar contract deploy \
  --wasm target/wasm32v1-none/release/workload_governor.wasm \
  --network testnet \
  --source <your-account>

# Initialize
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <admin-account> \
  -- initialize \
  --admin <ADMIN_ADDRESS>
```

## Design System

The frontend ships a token-driven design system consumed by all UI components.

| Artifact | Location |
|---|---|
| Design tokens (JSON) | [`frontend/src/tokens.json`](frontend/src/tokens.json) |
| CSS custom properties | [`frontend/src/tokens.css`](frontend/src/tokens.css) |
| Component library | [`frontend/src/components/`](frontend/src/components/) |
| Storybook stories | [`frontend/src/stories/`](frontend/src/stories/) |

### Running Storybook

```bash
cd frontend
npm run storybook        # dev server at http://localhost:6006
npm run build-storybook  # static build → storybook-static/
```

Components covered: **Button** (primary / secondary / ghost), **Badge** (5 semantic variants), **Card**, **Modal**, **Table**, **Gauge**.  
Dark mode is driven by `@media (prefers-color-scheme: dark)` CSS custom properties — no extra dependency required.

## Status

| Check | Endpoint | Dashboard |
|---|---|---|
| Backend health | `GET /api/health` | [Route 53 Health Checks](https://console.aws.amazon.com/route53/healthchecks/home) |
| Frontend | ALB root `/` | [Route 53 Health Checks](https://console.aws.amazon.com/route53/healthchecks/home) |
| Horizon network | `GET /api/health/network` | [Route 53 Health Checks](https://console.aws.amazon.com/route53/healthchecks/home) |

SLA target: **99.5% monthly uptime**. Alerts are sent to the `devops-alerts` SNS topic after 2 consecutive failures. Availability alarms fire when the 1-hour average drops below 99.5%.

## License

Apache-2.0

