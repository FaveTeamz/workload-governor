# Organization Management Guide

This guide covers the admin operations required to set up and manage organizations within WorkloadGovernor. It is the companion reference for [maintainer-guide.md](maintainer-guide.md).

## Table of Contents

- [Contract Initialization](#contract-initialization)
- [Organization Model](#organization-model)
- [Registering Maintainers](#registering-maintainers)
- [Managing Multiple Organizations](#managing-multiple-organizations)
- [Contract Upgrades](#contract-upgrades)
- [Operational Limits Reference](#operational-limits-reference)
- [See Also](#see-also)

---

## Contract Initialization

Before any org or maintainer operations can occur, the contract must be initialized with an admin address. This is a one-time, irreversible operation.

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  --source <admin-account> \
  -- initialize \
  --admin <ADMIN_ADDRESS>
```

Calling `initialize` a second time panics with error `1` (`AlreadyInitialized`).

---

## Organization Model

WorkloadGovernor does not maintain an explicit org registry. An organization exists implicitly whenever a maintainer is registered for a given `org_id` Symbol. There is no `create_org` function — the first `register_maintainer` call for a new `org_id` bootstraps that org's effective presence.

`org_id` values are Soroban `Symbol` scalars:
- Maximum 9 characters
- Valid characters: `[a-zA-Z0-9_]`
- Case-sensitive — `AcmeOrg` and `acmeorg` are different orgs
- Recommended convention: lowercase with underscores, e.g. `acme_org`

---

## Registering Maintainers

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  --source <admin-account> \
  -- register_maintainer \
  --admin <ADMIN_ADDRESS> \
  --maintainer <MAINTAINER_ADDRESS> \
  --org_id <ORG_ID>
```

- Requires authentication from the stored admin address
- Idempotent — safe to call multiple times for the same pair
- Each `(maintainer, org_id)` pair is an independent persistent storage entry

To register multiple maintainers for the same org:

```bash
ORG="acme_org"
for M in "$MAINTAINER_1" "$MAINTAINER_2" "$MAINTAINER_3"; do
  stellar contract invoke \
    --id "$CONTRACT_ID" --network "$NETWORK" --source <admin-account> \
    -- register_maintainer \
    --admin "$ADMIN" --maintainer "$M" --org_id "$ORG"
done
```

---

## Managing Multiple Organizations

Each org is fully isolated. Maintainer permissions, assignment counts, and application entries are all keyed by `org_id`. Adding or removing a maintainer in one org has zero effect on any other.

For detailed multi-org workflows from a maintainer's perspective, see [maintainer-guide.md — Multi-Org Management](maintainer-guide.md#multi-org-management).

---

## Contract Upgrades

The admin can upgrade the contract WASM without changing the contract address:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  --source <admin-account> \
  -- upgrade \
  --new_wasm_hash <NEW_WASM_HASH_HEX>
```

Build and get the hash:

```bash
stellar contract build
stellar contract optimize \
  --wasm target/wasm32v1-none/release/workload_governor.wasm

# The hash is printed by the deploy/install command, or compute it:
stellar contract install \
  --wasm target/wasm32v1-none/release/workload_governor.optimized.wasm \
  --network "$NETWORK" \
  --source <admin-account>
```

---

## Operational Limits Reference

| Constant | Value | Description |
|---|---|---|
| `GLOBAL_APP_LIMIT` | 15 | Max pending applications per contributor across all orgs |
| `ORG_ASSIGNMENT_LIMIT` | 4 | Max active assignments per contributor per org |
| `APP_TTL_LEDGERS` | 17,280 | Application TTL (~24 h at 5 s/ledger) |
| `INSTANCE_TTL_LEDGERS` | 518,400 | Contract instance TTL (~30 days) |

---

## See Also

- [maintainer-guide.md](maintainer-guide.md) — Maintainer operations including multi-org workflows
- [error-reference.md](error-reference.md) — All 11 error codes with resolution playbooks
- [storage-design.md](storage-design.md) — Storage key design and collision-free proof
