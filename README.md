# WorkloadGovernor

[![codecov](https://codecov.io/gh/FaveTeamz/workload-governor/branch/main/graph/badge.svg?token=CODECOV_TOKEN)](https://codecov.io/gh/FaveTeamz/workload-governor)
[![Backend Coverage](https://codecov.io/gh/FaveTeamz/workload-governor/branch/main/graph/badge.svg?flag=backend)](https://codecov.io/gh/FaveTeamz/workload-governor)
[![Frontend Coverage](https://codecov.io/gh/FaveTeamz/workload-governor/branch/main/graph/badge.svg?flag=frontend)](https://codecov.io/gh/FaveTeamz/workload-governor)
[![Contract Coverage](https://codecov.io/gh/FaveTeamz/workload-governor/branch/main/graph/badge.svg?flag=contract)](https://codecov.io/gh/FaveTeamz/workload-governor)

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

## Storage Design

| Category | Tier | Key | Value |
|---|---|---|---|
| Global App Count | Temporary (Wave TTL) | `("g_apps", contributor)` | `u32` |
| App Entry | Temporary (Wave TTL) | `("app", contributor, org_id, issue_id)` | `bool` |
| Admin | Persistent | `"admin"` | `Address` |
| Maintainer | Persistent | `("maint", maintainer, org_id)` | `bool` |
| Org Assignment Count | Persistent | `("o_asgn", contributor, org_id)` | `u32` |
| Assignment Entry | Persistent | `("asgn", org_id, issue_id, contributor)` | `bool` |

All six key prefixes are distinct — zero key collision guarantee.

## Documentation

| Document | Description |
|---|---|
| [docs/storage-design.md](docs/storage-design.md) | Storage key patterns, TTL semantics, and collision-free proof |
| [docs/error-reference.md](docs/error-reference.md) | All 11 error codes with causes, resolutions, and example scenarios |
| [docs/api-reference.md](docs/api-reference.md) | Complete REST API reference with request/response examples |

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

## Testing

```bash
# All tests (unit + property-based)
cargo test --features testutils

# Property-based tests only
cargo test --features testutils prop_

# Unit tests only
cargo test --features testutils unit_
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

## License

Apache-2.0
