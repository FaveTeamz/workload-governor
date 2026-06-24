# Frequently Asked Questions

Answers to common questions from contributors and maintainers of the
WorkloadGovernor-powered AlignmentDrips Wave platform.

---

## For Contributors

### 1. Why can't I apply for more issues?

The contract enforces a **global cap of 15 pending applications** per contributor
across all organisations. Once you hold 15 pending applications the `apply_for_issue`
function returns error code `6` (`GlobalApplicationLimitReached`).

To free a slot: wait for a maintainer to assign one of your existing applications
(which converts it to an assignment and removes it from your pending count), or
withdraw an application yourself using `withdraw_application`.

---

### 2. How long does a pending application last?

Applications are stored in **temporary storage** with a TTL of approximately
**17 280 ledgers (~24 hours at 5 s/ledger)**. This TTL is set to match the current
Wave duration.

If the ledger TTL is not refreshed before it expires, the application entry is
silently archived by the Soroban host — it disappears as if it never existed.

---

### 3. What happens when my application expires?

When an application expires:

- The on-chain sentinel entry is archived and `has_applied` returns `false`.
- Your global application counter is **not automatically decremented** — the counter
  entry has the same TTL and expires at the same time.
- Once both entries expire your global count naturally returns to zero for that slot.

Because the counter and the sentinel share the same TTL, both expire together.
The net effect is that an expired application frees up one global slot automatically.

---

### 4. How do I prevent my application from expiring?

Call `extend_application_ttl(contributor, org_id, issue_id)` before the TTL runs out.
This function is **permissionless** — anyone can call it on your behalf (e.g. a bot or
a frontend cron job). It resets the TTL back to the full wave duration.

---

### 5. Can I apply for the same issue again after withdrawing?

Yes. `withdraw_application` removes the sentinel entry entirely, so the same
`(contributor, org_id, issue_id)` triple becomes available again. You can call
`apply_for_issue` with the same arguments and it will succeed as long as you are
below the global cap.

---

### 6. How many issues can I be assigned to at once?

You can hold a maximum of **4 active assignments per organisation**. This is enforced
by the contract via error code `7` (`OrgAssignmentLimitReached`).

There is no global assignment cap — the cap is per-org. You could theoretically have
4 assignments in org A and 4 in org B simultaneously.

---

### 7. What is the difference between an application and an assignment?

| Concept | Storage tier | Who creates it | Who removes it |
|---------|-------------|----------------|----------------|
| **Application** | Temporary (expires) | Contributor via `apply_for_issue` | Maintainer (→ assignment) or contributor via `withdraw_application` |
| **Assignment** | Persistent (never expires) | Maintainer via `assign_issue` | Maintainer via `complete_assignment` or `revoke_assignment` |

An assignment is created by consuming the corresponding application — they cannot
coexist. Once assigned, your work slot is held indefinitely until the maintainer
marks it done or revokes it.

---

### 8. What happens if I have an assignment and it is revoked?

The assignment entry is deleted and your per-org assignment count is decremented.
You are free to apply again for the same issue or any other issue. The contract
makes no record of the revocation beyond the on-chain event.

---

## For Maintainers

### 9. How do I become a maintainer?

Only the contract admin can register maintainers. The admin calls
`register_maintainer(admin, maintainer_address, org_id)`. Once registered, the
`(maintainer, org_id)` pair is stored in persistent storage and the maintainer can
call `assign_issue`, `complete_assignment`, and `revoke_assignment` for that org.

Maintainer registration is **per-organisation** — being a maintainer for org A does
not grant rights over org B.

---

### 10. Can I assign an issue to a contributor who has not applied?

No. `assign_issue` requires an existing application entry for the
`(contributor, org_id, issue_id)` triple. If no application exists the call
returns error code `9` (`ApplicationNotFound`). This ensures contributors have
explicitly opted in before work is assigned to them.

---

### 11. What is the difference between `complete_assignment` and `revoke_assignment`?

Both functions remove the assignment and free the contributor's org slot. The
only difference is the event they emit:

- `complete_assignment` → emits `assignment_completed` (work was accepted).
- `revoke_assignment`   → emits `assignment_revoked` (work was cancelled).

Downstream systems (dashboards, analytics) can use these distinct events to
differentiate successful completions from cancellations.

---

### 12. Can two contributors be assigned to the same issue?

Yes — the assignment key is `(org_id, issue_id, contributor)`, so each contributor
has their own independent assignment entry. If you want to prevent double-assignment
at the application layer you must enforce that policy off-chain; the contract
does not restrict the number of contributors per issue.

---

### 13. What does `AlreadyAssigned` mean?

Error code `11` (`AlreadyAssigned`) is returned by `assign_issue` when an active
assignment already exists for the exact `(contributor, org_id, issue_id)` triple.
This prevents a maintainer from accidentally assigning the same issue to the same
contributor twice.

---

## General

### 14. How is the contract upgraded?

The admin calls `upgrade(new_wasm_hash)` with the 32-byte hash of a WASM binary that
has already been uploaded to the network. The contract WASM is replaced in-place
**without changing the contract address**. All existing storage entries remain intact.

Only the admin can upgrade. Ensure the new WASM is thoroughly tested before upgrading
on mainnet — there is no rollback mechanism beyond uploading the old WASM again and
calling `upgrade` a second time.
