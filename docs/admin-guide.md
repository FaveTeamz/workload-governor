# WorkloadGovernor Admin Guide

This guide covers operational procedures for the admin of the WorkloadGovernor contract. The admin address is set once at initialisation and cannot be changed without a contract upgrade.

## Prerequisites

- Stellar CLI installed (`stellar --version`)
- Admin account key available to your local keystore
- `CONTRACT_ID` and `--network` values for your target environment

---

## Contract Initialisation

Call `initialize` once after deploying the contract WASM. This is a one-time operation — calling it a second time returns error `1` (`AlreadyInitialized`).

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <admin-account> \
  -- initialize \
  --admin <ADMIN_ADDRESS>
```

---

## Maintainer Onboarding

Authorise a maintainer to manage issues within a specific organisation using `register_maintainer`. The operation is idempotent — registering the same `(maintainer, org_id)` pair twice is safe.

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <admin-account> \
  -- register_maintainer \
  --admin <ADMIN_ADDRESS> \
  --maintainer <MAINTAINER_ADDRESS> \
  --org_id <ORG_ID>
```

**On success** the contract emits a `maint_reg` event with `(maintainer, org_id)` in the data payload.

**Errors**

| Code | Variant | Cause |
|------|---------|-------|
| 2 | `NotInitialized` | Contract has not been initialised yet |
| 3 | `UnauthorizedAdmin` | Caller is not the stored admin |

---

## Maintainer Offboarding

When a maintainer leaves an organisation, their access must be revoked immediately to preserve security integrity. Use `deregister_maintainer` to delete the `(maint, maintainer, org_id)` persistent storage entry.

Once deregistered, any call the former maintainer makes to `assign_issue`, `complete_assignment`, or `revoke_assignment` for that organisation will fail with error `4` (`UnauthorizedMaintainer`).

### Procedure

1. Confirm the maintainer's address and the target `org_id`.
2. Invoke `deregister_maintainer` as the admin:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <admin-account> \
  -- deregister_maintainer \
  --admin <ADMIN_ADDRESS> \
  --maintainer <MAINTAINER_ADDRESS> \
  --org_id <ORG_ID>
```

3. Verify the transaction is confirmed on-chain and the `maint_drg` event has been emitted.
4. Optionally re-register a replacement maintainer for the same org using `register_maintainer`.

### Verification

After deregistration, confirm the maintainer no longer has access by attempting a dry-run call:

```bash
# This should fail with UnauthorizedMaintainer (code 4)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <former-maintainer-account> \
  -- assign_issue \
  --maintainer <MAINTAINER_ADDRESS> \
  --contributor <ANY_ADDRESS> \
  --org_id <ORG_ID> \
  --issue_id 1
```

### Emitted Event

`deregister_maintainer` publishes a `maint_drg` event:

| Field | Value |
|-------|-------|
| Topic 0 | `maint_drg` (Symbol) |
| Topic 1 | `admin` (Address) |
| Data 0 | `maintainer` (Address) |
| Data 1 | `org_id` (Symbol) |

### Errors

| Code | Variant | Cause |
|------|---------|-------|
| 2 | `NotInitialized` | Contract has not been initialised yet |
| 3 | `UnauthorizedAdmin` | Caller is not the stored admin |
| 17 | `MaintainerNotFound` | The maintainer is not registered for this org (already deregistered or was never registered) |

### Important Notes

- **Active assignments are not revoked automatically.** Deregistering a maintainer does not touch any open assignments they created. Review and revoke outstanding assignments manually using `revoke_assignment` before or after deregistration as appropriate.
- **The operation is per-org.** If a maintainer is registered for multiple organisations, you must call `deregister_maintainer` once per `org_id`.
- **The operation is not reversible via this function.** To re-authorise the same address, call `register_maintainer` again.

---

## Contract Upgrade

To upgrade the contract WASM:

1. Upload the new WASM to the network and note the resulting hash.
2. Call `upgrade`:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <admin-account> \
  -- upgrade \
  --new_wasm_hash <32-BYTE-HASH-HEX>
```

The contract address does not change. All storage entries are preserved.

---

## Error Reference

For the full list of error codes and their resolutions, see [docs/error-reference.md](error-reference.md).
