# WorkloadGovernor — API Reference

Full function signatures, parameter types, return values, and error codes for the WorkloadGovernor Soroban smart contract.

## Admin Functions

### `initialize(admin: Address)`

One-time contract setup. Stores `admin` as the contract administrator and emits the [`init`](./event-schema.md#1-init--contract-initialized) event.

**Auth**: `admin.require_auth()`  
**Errors**: `AlreadyInitialized (1)` if called more than once.

---

### `register_maintainer(admin: Address, maintainer: Address, org_id: Symbol)`

Authorizes `maintainer` to manage issues in `org_id`. Idempotent — calling twice is safe. Emits the [`maint_reg`](./event-schema.md#2-maint_reg--maintainer-registered) event.

**Auth**: stored admin address  
**Errors**: `NotInitialized (2)`, `UnauthorizedAdmin (3)`

---

### `upgrade(new_wasm_hash: BytesN<32>)`

Replaces the contract WASM in-place without changing the contract address. Does not emit an event.

**Auth**: stored admin address  
**Errors**: `NotInitialized (2)`, `UnauthorizedAdmin (3)`

---

## Contributor Functions

### `apply_for_issue(contributor: Address, org_id: Symbol, issue_id: u32)`

Records a pending application. Increments the contributor's global application count and sets the application entry TTL. Emits [`app_sub`](./event-schema.md#3-app_sub--application-submitted).

**Auth**: `contributor.require_auth()`  
**Errors**: `NotInitialized (2)`, `UnauthorizedContributor (5)`, `GlobalApplicationLimitReached (6)`, `DuplicateApplication (8)`

---

### `withdraw_application(contributor: Address, org_id: Symbol, issue_id: u32)`

Cancels a pending application and decrements the global count. Emits [`app_wdw`](./event-schema.md#4-app_wdw--application-withdrawn).

**Auth**: `contributor.require_auth()`  
**Errors**: `NotInitialized (2)`, `UnauthorizedContributor (5)`, `ApplicationNotFound (9)`

---

## Maintainer Functions

### `assign_issue(maintainer: Address, contributor: Address, org_id: Symbol, issue_id: u32)`

Converts an existing application into an active assignment. Consumes the application entry and increments the org assignment count. Emits [`assigned`](./event-schema.md#5-assigned--issue-assigned).

**Auth**: `maintainer.require_auth()`  
**Errors**: `NotInitialized (2)`, `UnauthorizedMaintainer (4)`, `ApplicationNotFound (9)`, `OrgAssignmentLimitReached (7)`, `AlreadyAssigned (11)`

---

### `complete_assignment(maintainer: Address, contributor: Address, org_id: Symbol, issue_id: u32)`

Marks an assignment as done and decrements the org assignment count. Emits [`completed`](./event-schema.md#6-completed--assignment-completed).

**Auth**: `maintainer.require_auth()`  
**Errors**: `NotInitialized (2)`, `UnauthorizedMaintainer (4)`, `AssignmentNotFound (10)`

---

### `revoke_assignment(maintainer: Address, contributor: Address, org_id: Symbol, issue_id: u32)`

Cancels an active assignment and decrements the org assignment count. Emits [`revoked`](./event-schema.md#7-revoked--assignment-revoked).

**Auth**: `maintainer.require_auth()`  
**Errors**: `NotInitialized (2)`, `UnauthorizedMaintainer (4)`, `AssignmentNotFound (10)`

---

## TTL Management

### `extend_application_ttl(contributor: Address, org_id: Symbol, issue_id: u32)`

Permissionless. Bumps the TTL for a pending application entry and the contributor's global app-count entry.

**Auth**: none  
**Errors**: `ApplicationNotFound (9)`

---

## Read-Only Queries

All query functions are read-only (no storage mutations, no events emitted).

### `get_global_application_count(contributor: Address) -> u32`

Returns the contributor's current number of pending applications across all orgs (0 if absent or expired).

### `get_org_assignment_count(contributor: Address, org_id: Symbol) -> u32`

Returns the contributor's active assignment count for `org_id` (0 if absent).

### `has_applied(contributor: Address, org_id: Symbol, issue_id: u32) -> bool`

Returns `true` if a pending application exists for the given (contributor, org, issue) tuple.

### `is_assigned(contributor: Address, org_id: Symbol, issue_id: u32) -> bool`

Returns `true` if an active assignment exists.

### `get_global_application_capacity(contributor: Address) -> u32`

Returns `15 - current_count`. Useful for UI "X/15" displays.

### `get_org_assignment_capacity(contributor: Address, org_id: Symbol) -> u32`

Returns `4 - current_count`. Useful for UI "X/4" displays.

### `is_global_application_limit_reached(contributor: Address) -> bool`

Returns `true` if the contributor has 15 pending applications.

### `is_org_assignment_limit_reached(contributor: Address, org_id: Symbol) -> bool`

Returns `true` if the contributor has 4 active assignments in the org.

---

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

See also: [Security Model](./security-model.md) for error codes in a threat-model context.

---

## Related Documents

- [Event Schema](./event-schema.md) — all emitted events with field descriptions
- [Security Model](./security-model.md) — threat actors, mitigations, and auth flow
- [Integration Guide](../INTEGRATION_GUIDE.md) — end-to-end SDK usage
- [README](../README.md) — overview and quick-start
