# ADR-006: Use a Two-Step Propose/Accept Pattern for Admin Transfer

**Status:** Accepted  
**Date:** 2026-08-30  
**Deciders:** Core team  
**Issue:** [#791](https://github.com/FaveTeamz/workload-governor/issues/791)

---

## Context

The contract stores a single admin `Address` under the persistent key
`"admin"`, set once by `initialize`. The admin is the only party that can
register maintainers, upgrade the contract WASM, configure the multi-sig
threshold, and run storage migrations. Whoever holds the admin key therefore
controls every other role in the system.

Admin keys must be rotated from time to time: a key may be compromised, an
operator may leave, or custody may move to a hardware wallet or multi-sig
account. Rotation is the riskiest routine operation the contract supports,
for three reasons:

- **There is no recovery path on-chain.** `initialize` panics with
  `AlreadyInitialized` (error 1) on a second call, so if admin authority is
  handed to an address nobody controls, it cannot be reclaimed short of
  deploying a new contract and migrating all state.
- **Addresses are easy to get wrong.** A Stellar address is a 56-character
  string. A copy-paste error, a testnet address used on mainnet, or a
  contract address in place of an account address all produce a valid
  `Address` value that the contract cannot tell apart from the intended one.
- **The old key may already be compromised.** Rotation is often done *because*
  a key is suspected leaked. The design should not let whoever holds the old
  key move authority to an address of their choosing without the recipient's
  involvement.

---

## Decision

**Admin authority is transferred in two separate transactions, each signed
by a different party:**

1. `propose_admin(current_admin, new_admin)` — signed by the stored admin.
   Writes `new_admin` to the persistent key `"p_admin"` and emits
   `AdminTransferProposed { current_admin, new_admin }`. The current admin
   keeps full authority.
2. `accept_admin(new_admin)` — signed by the nominated address. Checks that
   `new_admin` matches `"p_admin"`, then in a single invocation overwrites
   `"admin"`, removes `"p_admin"`, and emits
   `AdminTransferred { old_admin, new_admin }`.

There is deliberately no one-step `set_admin` function.

---

## Reasons

### 1. The new admin proves key ownership before the transfer completes

`accept_admin` requires `new_admin.require_auth()`. A transfer can only
complete if someone can actually sign for the nominated address. A typo,
a wrong network, or an address with no known private key leaves the
proposal pending, and the current admin keeps authority and can correct
the mistake. With one-step transfer, the same mistake permanently locks the
contract.

### 2. Two keys are required to move authority

A leaked old admin key can nominate an attacker's address, but the attacker
must still hold a key the current admin chose to nominate. In the other
direction, a leaked *new* key cannot claim authority without a prior
`propose_admin`. Neither key alone can move admin authority. Each step also
emits its own event, so an unexpected `AdminTransferProposed` event gives
monitoring a chance to alert before the transfer completes.

### 3. Mistakes are cheap to correct

Calling `propose_admin` again overwrites `"p_admin"`, so a wrong nomination
is fixed with one more transaction and no separate cancel function. The
current admin stays in control the whole time.

### 4. It is the established pattern

Two-step ownership transfer is standard in smart-contract access control
(for example OpenZeppelin's `Ownable2Step`). Auditors and operators already
know how it behaves, which lowers review cost and operator error.

---

## Consequences

### Positive

- A mistyped or uncontrolled address can no longer lock the contract.
- Rotating away from a compromised key needs the recipient's signature,
  not just the old key.
- Both steps emit events, so the backend indexer and alerting can follow
  rotations as they happen.

### Negative

- **Rotation takes two transactions and two signers.** Operators must
  coordinate between the old and new key holders. The
  [admin key rotation runbook](../runbooks/admin-key-rotation.md) covers
  the procedure.
- **One extra persistent entry.** `"p_admin"` adds a persistent storage key
  with its own rent and TTL, and one more key to check in the collision
  check (`scripts/check-key-collisions.sh`).
- **A pending proposal has no expiry.** If `accept_admin` is never called,
  `"p_admin"` stays set until it is overwritten by another `propose_admin`
  or its persistent TTL lapses. A stale proposal can be accepted later by
  the nominated key, so operators should either complete a proposal or
  overwrite it with the current admin's own address to neutralise it.
- **No time-lock.** `accept_admin` takes effect in the ledger it is
  confirmed in. Detecting a malicious proposal relies on off-chain
  monitoring of `AdminTransferProposed` events, not an on-chain delay.

### Neutral

- **What happens if `accept_admin` is never called:** nothing changes. The
  old admin stays active and all admin-gated functions keep working. The
  proposal only matters if the nominated key signs `accept_admin`.
- **Error behaviour:**

  | Situation | Result |
  |---|---|
  | `propose_admin` not signed by the stored admin | Soroban auth failure; the stored admin's `require_auth()` rejects the call |
  | `accept_admin` with an address other than the one stored in `"p_admin"` | `UnauthorizedAdmin` (error 3) |
  | `accept_admin` signed by someone other than `new_admin` | Soroban auth failure from `new_admin.require_auth()` |
  | `accept_admin` with no pending proposal | `NoPendingAdminTransfer` |
  | Either function before `initialize` | `NotInitialized` (error 2) |

- The multi-sig threshold (`set_admin_threshold`, see #603) is set
  separately. Rotating the admin address does not change the configured
  signer list.

---

## Implementation Status

This ADR records the decision as described in the README contract function
and storage tables, the [admin key rotation runbook](../runbooks/admin-key-rotation.md),
and [benchmarks.md](../benchmarks.md).

As of this ADR, `propose_admin`, `accept_admin`, the `"p_admin"` storage
helpers, and the `adm_prop` event were written in commit `fc6a4754` on the
upstream `feat/issues-600-603` branch but **have not been merged into
`main`**. When that work lands, its error codes must be renumbered:
`fc6a4754` assigns `NoPendingAdminTransfer = 15` and
`PendingAdminTransferExists = 16`, but on `main` codes 13–17 already belong
to `InvalidIssueId`, `InvalidThreshold`, `ProposalNotFound`,
`ProposalExpired`, and `AlreadyVoted`. The runbook's reference to
"error 15" for `NoPendingAdminTransfer` should be updated to match the final
number.

---

## Alternatives Considered

| Alternative | Reason rejected |
|-------------|----------------|
| **One-step `set_admin(new_admin)`** | Simplest to build and operate, but a single wrong address permanently and irrecoverably locks the contract, because `initialize` cannot be called again. It also lets a leaked old key move authority by itself. |
| **Multisig guardian** (a set of guardian keys that must co-sign every rotation) | Adds strong protection but needs guardian set management, quorum logic, and extra storage in the core contract. The contract already supports an optional multi-sig admin threshold (`set_admin_threshold`, #603), and an admin that is itself a Stellar multisig account gets the same protection at the account level without contract changes. Two-step transfer composes with either. |
| **Timelock delay** (proposal can only be accepted after N ledgers) | Gives observers time to react to a malicious proposal, but slows every rotation, including urgent ones after a key compromise, when speed matters most. It also needs cancel logic and ledger-based expiry. Off-chain alerts on `AdminTransferProposed` cover most of the same risk. It can be added later without changing the propose/accept interface. |
| **DAO / governance vote** (orgs vote on admin changes) | The contract's governance proposals (`propose_cap_change` / `vote_cap_change`, #600) need a quorum of 3 orgs. Applying that to admin rotation would make emergency rotation depend on org availability and would mix protocol governance with operational key management. |

---

## References

- [Admin key rotation runbook](../runbooks/admin-key-rotation.md)
- [Admin guide](../admin-guide.md#admin-transfer)
- [Security model](../security-model.md)
- [ADR-001: Storage key design](ADR-001-storage-key-design.md): prefix and collision rules the `"p_admin"` key follows
- `src/lib.rs`: `initialize`, `set_admin_threshold`; `propose_admin` / `accept_admin` in commit `fc6a4754`
- `src/storage.rs`: `"admin"` key; `"p_admin"` key in commit `fc6a4754`
- `src/errors.rs`: `UnauthorizedAdmin = 3`
- [OpenZeppelin `Ownable2Step`](https://docs.openzeppelin.com/contracts/5.x/api/access#Ownable2Step)
