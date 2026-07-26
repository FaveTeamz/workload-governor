# Fairness Model

## The Problem

Open-source contribution platforms suffer from two related failure modes when
faster or more connected developers can claim tasks without limit:

1. **Application hoarding** – A contributor applies for many issues across orgs,
   blocking others from applying, then sits idle or abandons most of them.
2. **Assignment monopolization** – Within one org, a single contributor holds
   every available active task, starving other contributors.

Both patterns reduce contribution diversity and slow net throughput: tasks
appear claimed but make no progress.

---

## Formal Definitions

Let the system state be a tuple ⟨S, A⟩ where:

- **S** (application set) = `{ (contributor, org_id, issue_id) | has_applied = true }`
- **A** (assignment set) = `{ (org_id, issue_id, contributor) | is_assigned = true }`

Define two counter functions derived from state:

```
GlobalAppCount(c)     = |{ (c, o, i) ∈ S }|
                        (number of pending applications for contributor c)

OrgAssignCount(c, o)  = |{ (o, i, c) ∈ A }|
                        (number of active assignments for contributor c in org o)
```

The contract maintains two counters in storage as redundant state (denormalised
for O(1) reads without enumeration):

```
g_apps[c]     ≡ GlobalAppCount(c)
o_asgn[c, o]  ≡ OrgAssignCount(c, o)
```

### Fairness Invariants

Let **G = 15** (GLOBAL_APP_LIMIT) and **A = 4** (ORG_ASSIGNMENT_LIMIT).

**Invariant I1 (Global Application Cap):**
```
∀ c, time t:  GlobalAppCount(c) ≤ G
```

**Invariant I2 (Org Assignment Cap):**
```
∀ c, o, time t:  OrgAssignCount(c, o) ≤ A
```

These invariants must hold after every successful contract invocation, for all
possible call sequences by any set of callers.

---

## Proof of Invariant Preservation

We enumerate every state-changing function and show it preserves both invariants.

### Notation

- `count_before` = value of the counter before the call
- `count_after`  = value of the counter after the call
- `→` means "therefore" / "we conclude"

---

### `apply_for_issue(contributor, org_id, issue_id)`

**Pre-conditions checked by contract:**
1. `count_before = g_apps[contributor]`
2. Contract asserts: `count_before < G` — panics with `GlobalApplicationLimitReached` if false
3. Contract asserts: `(contributor, org_id, issue_id) ∉ S` — panics with `DuplicateApplication` if false

**State transitions:**
- Adds `(contributor, org_id, issue_id)` to S
- Sets `g_apps[contributor] = count_before + 1`

**Proof of I1:**
```
count_before < G  (asserted in step 2)
count_after = count_before + 1 ≤ G  ∎
```

**Proof of I2:** I2 is unchanged — `apply_for_issue` does not modify A or o_asgn. ∎

---

### `withdraw_application(contributor, org_id, issue_id)`

**Pre-conditions:**
1. `count_before = g_apps[contributor]`
2. Contract asserts: `(contributor, org_id, issue_id) ∈ S` — panics with `ApplicationNotFound` if false

**State transitions:**
- Removes `(contributor, org_id, issue_id)` from S
- Sets `g_apps[contributor] = count_before - 1` (or removes the key if result is 0)

**Proof of I1:**
```
count_before ≥ 1  (entry exists, so count is at least 1)
count_after = count_before - 1 ≤ count_before ≤ G  ∎
```

**Proof of I2:** Unchanged — does not modify A or o_asgn. ∎

---

### `assign_issue(maintainer, contributor, org_id, issue_id)`

**Pre-conditions:**
1. `app_count_before = g_apps[contributor]` (global applications)
2. `asgn_count_before = o_asgn[contributor, org_id]` (org assignments)
3. Contract asserts: `(contributor, org_id, issue_id) ∈ S` — panics with `ApplicationNotFound`
4. Contract asserts: `asgn_count_before < A` — panics with `OrgAssignmentLimitReached`
5. Contract asserts: `(org_id, issue_id, contributor) ∉ A` — panics with `AlreadyAssigned`

**State transitions:**
- Removes `(contributor, org_id, issue_id)` from S
- Sets `g_apps[contributor] = app_count_before - 1` (or removes if 0)
- Adds `(org_id, issue_id, contributor)` to A
- Sets `o_asgn[contributor, org_id] = asgn_count_before + 1`

**Proof of I1:**
```
app_count_before ≥ 1  (entry exists)
g_apps[contributor]_after = app_count_before - 1 ≤ G - 1 < G  ∎
```

**Proof of I2:**
```
asgn_count_before < A  (asserted in step 4)
o_asgn[contributor, org_id]_after = asgn_count_before + 1 ≤ A  ∎
```

---

### `complete_assignment(maintainer, contributor, org_id, issue_id)`

**Pre-conditions:**
1. `asgn_count_before = o_asgn[contributor, org_id]`
2. Contract asserts: `(org_id, issue_id, contributor) ∈ A` — panics with `AssignmentNotFound`

**State transitions:**
- Removes `(org_id, issue_id, contributor)` from A
- Sets `o_asgn[contributor, org_id] = asgn_count_before - 1` (or removes if 0)

**Proof of I1:** Unchanged — S and g_apps are unmodified. ∎

**Proof of I2:**
```
asgn_count_before ≥ 1  (assignment entry exists)
o_asgn[contributor, org_id]_after = asgn_count_before - 1 ≤ A - 1 < A ≤ A  ∎
```

---

### `revoke_assignment(maintainer, contributor, org_id, issue_id)`

Identical logic to `complete_assignment`. Pre-conditions and transitions are the
same; the only difference is the event type.

**Proof of I1, I2:** Same argument as `complete_assignment`. ∎

Note: `revoke_assignment` additionally asserts `asgn_count_before > 0` before
decrementing and panics with `CounterInconsistency` if zero. This is a
conservative defence against storage corruption — it does not affect the
invariant proof (the same bound holds with or without this guard).

---

### `extend_application_ttl`

Read-only with respect to S and A (only extends TTL metadata). Does not change
any counter. Invariants trivially preserved. ∎

---

### Read-only queries

`get_global_application_count`, `get_org_assignment_count`, `has_applied`,
`is_assigned`, `get_org_assignment_capacity`, `get_global_application_capacity`,
`is_org_assignment_limit_reached`, `global_app_limit_reached` — all read-only.
No state changes. Invariants trivially preserved. ∎

---

### `initialize`, `register_maintainer`, `upgrade`, `transfer_admin`

These functions modify the admin/maintainer/contract-wasm storage but do not
touch S, A, g_apps, or o_asgn. Invariants trivially preserved. ∎

---

### Completeness

All 15 public functions have been analysed. Every state-modifying function either:
- Decrements a counter (lower bound ensures non-negative)
- Increments a counter only after asserting strict inequality with the cap
- Does not touch the relevant counters at all

The invariants **I1** and **I2** hold globally for all reachable states. ∎

---

## Counter Consistency Lemma

The redundant counters (`g_apps` and `o_asgn`) are kept in sync with the
canonical sets (S and A) by the following argument:

**Lemma (g_apps consistency):**
```
g_apps[c] = GlobalAppCount(c) after every successful call
```

*Proof sketch:* Initially both are 0 (before any call). `apply_for_issue`
increments both simultaneously. `withdraw_application` and `assign_issue`
both remove one entry from S and decrement g_apps[c] by exactly 1.
No other function modifies g_apps. By induction over call sequences. ∎

**Lemma (o_asgn consistency):**
```
o_asgn[c, o] = OrgAssignCount(c, o) after every successful call
```

*Proof sketch:* Same argument — `assign_issue` increments both;
`complete_assignment` and `revoke_assignment` decrement both.
No other function modifies o_asgn. ∎

---

## Gaming Vectors and Mitigations

This section analyses known threat models: scenarios where a rational adversary
tries to gain an unfair advantage while remaining within the rules.

---

### Vector 1 — Sybil Attack (Multiple Addresses)

**Description:**
An adversary creates multiple Stellar keypairs (addresses) and uses each one as
a separate contributor identity. Each address has its own independent cap, so
the adversary can submit up to G × N applications across N addresses.

**Example:**
Alice creates 10 addresses: `alice_1` through `alice_10`. She applies for 15
issues per address = 150 total pending applications from a single human.

**Why the contract cannot fully prevent it:**
The contract enforces per-address caps. Stellar addresses are pseudonymous and
free to generate. There is no on-chain identity linkage.

**Mitigations:**

1. **Social/reputation layer (off-chain):** Require contributors to link a GitHub
   account or other identity provider to their Stellar address before applying.
   This is implemented at the backend/API layer, not in the contract.

2. **Stake requirement:** Require each contributing address to hold a minimum
   token balance or fee deposit. This raises the cost of Sybil attacks without
   eliminating them.

3. **Rate limiting at the platform layer:** The backend API can detect and
   throttle applications from addresses created within the last N ledgers or
   funded by the same source account (traceable on-chain via Horizon).

4. **Contract-level Sybil resistance:** A future upgrade could require
   contributor addresses to be registered with the admin (like maintainers).
   This would completely prevent Sybil attacks but would also require admin
   approval for every contributor — a significant governance burden.

**Current severity:** Medium. The practical constraint is that each Sybil address
needs XLM to pay transaction fees. For testnet it is free, but on mainnet the
cost scales linearly with the number of identities.

---

### Vector 2 — Timing Attack (Apply-then-Withdraw Probing)

**Description:**
An adversary uses `apply_for_issue` + `withdraw_application` in rapid succession
to probe which issues are "hot" (many applications) without actually consuming
a slot for long. They apply, observe the state (e.g., via event indexing), then
immediately withdraw if the issue is already heavily applied-to, freeing their
cap for a different target.

**Sequence:**
```
apply_for_issue(self, org, 42)     # g_apps: 0 → 1
has_applied(other, org, 42)        # probe: is anyone competing?
withdraw_application(self, org, 42) # g_apps: 1 → 0 (immediate undo)
apply_for_issue(self, org, 99)     # apply for a "less contested" issue
```

**Impact:** Minimal. The contract does not expose per-issue application counts
to other contributors. A `has_applied` check only reveals whether *a specific
address* has applied, not the total count. The adversary cannot enumerate all
applicants without indexing all contract events. Withdraw-and-probe is expensive
in transaction fees and yields little information advantage.

**Mitigations:**

1. **No per-issue aggregation:** The contract intentionally does not expose a
   total application count per issue. This limits information leakage.

2. **Fee cost:** Each apply/withdraw pair costs two transactions with Soroban
   resource fees. Mass probing is economically inefficient.

3. **Event indexing opacity:** Off-chain event indexers can detect unusual
   apply/withdraw patterns from the same address and flag them.

4. **Application windows (future):** A configurable lockout period between
   apply and withdraw for the same (contributor, org, issue) triple would
   eliminate rapid probing entirely. This would require a contract upgrade.

**Current severity:** Low.

---

### Vector 3 — Cap Exhaustion by a Maintainer (Assignment Squatting)

**Description:**
A malicious or careless maintainer assigns all 4 slots in their org to a single
address they control (or collude with), then refuses to call
`complete_assignment` or `revoke_assignment`. New contributors cannot receive
assignments in that org indefinitely.

**Sequence:**
```
assign_issue(maintainer, attacker, org, 1)  # o_asgn: 0 → 1
assign_issue(maintainer, attacker, org, 2)  # o_asgn: 1 → 2
assign_issue(maintainer, attacker, org, 3)  # o_asgn: 2 → 3
assign_issue(maintainer, attacker, org, 4)  # o_asgn: 3 → 4
# Now no one else can be assigned in this org
```

**Why the contract allows it:** The contract only enforces the per-contributor
per-org cap (A = 4). It does not limit how many of the A slots can go to a
single address, nor does it require timely completion.

**Mitigations:**

1. **Admin can register multiple maintainers:** A healthy org has multiple
   registered maintainers who can call `revoke_assignment` on stale assignments
   from any contributor. Registered maintainers can override each other's
   assignments.

2. **Runbook for stale-assignment cleanup:**
   See `docs/runbooks/cap-emergency-increase.md` for the procedure to revoke
   stale assignments.

3. **TTL on application entries:** Applications expire automatically (≈24 h
   TTL). If all org slots are squatted, contributors' applications will simply
   expire rather than remaining in a permanently pending state.

4. **Contract upgrade for per-contributor slot limits:** A future upgrade could
   enforce a maximum number of issues assigned to the *same* contributor *by
   the same maintainer* within a window, making collusion harder.

5. **Off-chain reputation:** Track maintainer completion rates. Maintainers with
   low completion rates can be de-registered by the admin.

**Current severity:** Medium. Requires a compromised or malicious maintainer —
a trusted role — rather than an anonymous adversary.

---

### Vector 4 — Application TTL Griefing

**Description:**
A contributor applies for issue X to block others from applying (though the
contract has no per-issue cap, so this is not directly a block), then lets the
application expire by never extending the TTL. The issue appears "pending" in
off-chain UIs for up to 24 hours before the ledger entry is cleaned up.

**Impact:** Minor. The contract has no per-issue application limit — multiple
contributors can apply for the same issue simultaneously. TTL expiry is
automatic and handled by Soroban's state archival. The only cost is cosmetic
UI confusion.

**Mitigations:**

1. **`extend_application_ttl` is permissionless:** Anyone can call it to keep
   a legitimate application alive.

2. **Off-chain UI:** The frontend should display applications with a TTL
   countdown and grey out entries near expiry.

3. **TTL tuning:** The `APP_TTL_LEDGERS` constant (≈24 h) is configurable via
   contract upgrade. A shorter TTL reduces the window for griefing.

**Current severity:** Low.

---

### Vector 5 — Rapid Cycling (Counter Reset Exploit)

**Description:**
A contributor applies for an issue, gets assigned, and is immediately revoked
by a colluding maintainer. This returns their org assignment count to 0 without
marking any real work done. If this cycle can be repeated at high speed, it
could inflate some off-chain reputation metric that counts completions.

**Impact on-contract:** None. The contract's fairness invariants (I1, I2) are
preserved through the full apply → assign → revoke cycle. The only on-chain
effect is repeated event emission, which is visible to indexers.

**Mitigations:**

1. **Event indexers detect cycling:** The `Assigned` and `Revoked` events are
   on-chain. An indexer that counts `Assigned` vs `Revoked` pairs from the same
   triple within a short window can flag suspicious patterns.

2. **Off-chain reputation uses net completions:** Rate reputation on
   `Completed` events, not `Assigned` events. Revocations should count against
   a contributor's score.

**Current severity:** Low (no on-chain harm; only off-chain reputation abuse
risk).

---

## Summary

| Gaming Vector | Severity | Contract mitigates? | Requires off-chain? |
|---|---|---|---|
| Sybil (multiple addresses) | Medium | Partially (fee cost) | Yes — identity binding |
| Timing/probing | Low | Yes (no count aggregation) | Partially |
| Assignment squatting by maintainer | Medium | No | Yes — multi-maintainer + revoke |
| TTL griefing | Low | Yes (permissionless TTL extend) | Partially |
| Rapid cycle inflation | Low | Yes (events detectable) | Yes — indexer scoring |

---

## Tradeoffs and Limitations

**Cap values are fixed at compile time.** The limits (G = 15 global, A = 4
per-org) are constants in the contract. Adjusting them requires a contract
upgrade. There is no per-org configuration, so orgs with very different
velocity profiles are governed by the same numbers.

**No time-based pressure.** The caps count entries but do not penalise slow
progress. A contributor who holds 4 assignments in an org but makes no progress
blocks the cap just as much as one who ships quickly. TTL expiry on application
entries mitigates hoarding over time, but active assignments are persistent and
only cleared by maintainer action (`complete_assignment` / `revoke_assignment`).

**Maintainers are the enforcement backstop.** The org assignment cap can only be
relieved by a maintainer. If maintainers are inactive, stale assignments pile
up and block new ones. The contract enforces caps correctly but cannot force
maintainer activity.

**Global cap counts pending applications only.** Active assignments do not count
against the global cap of 15. A contributor could theoretically hold 15 pending
applications *plus* many active assignments simultaneously (up to 4 per org ×
number of orgs). This is intentional — assignments represent committed work,
not speculative claims.

**No contributor-level allow-listing.** All contributors are subject to the same
caps. There is no mechanism to grant a trusted contributor a higher limit without
a contract upgrade.

---

## External Review

This model was reviewed by an external smart contract developer (review tracked
in [docs/PR-103.md](PR-103.md)). Key findings from the review:

1. The proof covers all 15 public functions systematically.
2. The Sybil vector is correctly flagged as requiring off-chain mitigation.
3. The counter consistency lemma should be tested with property-based tests —
   these now exist in `src/test.rs` (`prop_global_app_count_consistent`,
   `prop_org_assign_count_consistent`).

---

## Worked Examples

### Scenario 1 — Normal active contributor (caps not reached)

Alice applies for 4 issues in Org A, 3 in Org B, and 2 in Org C: **9 pending
applications** (below 15). Maintainers assign 3 of her Org A applications.
Her global pending count drops to 6; her Org A assignment count is 3 (below 4).
She can still apply for 9 more issues globally and take 1 more assignment in
Org A. Everything works normally.

*Formal check:* `GlobalAppCount(alice) = 6 ≤ 15`. `OrgAssignCount(alice, A) = 3 ≤ 4`. Both invariants hold. ✓

### Scenario 2 — Global cap blocks an application hoarder

Bob applies for issues aggressively: 5 in Org A, 5 in Org B, 5 in Org C —
exactly **15 pending applications**. When he tries to apply for a 16th issue,
`apply_for_issue` returns `GlobalApplicationLimitReached` (error 6).

*Formal check:* `g_apps[bob] = 15`. Pre-condition `count_before < G` fails (`15 < 15` is false). Call is rejected. `GlobalAppCount(bob) = 15 ≤ 15`. Invariant I1 holds. ✓

### Scenario 3 — Org cap blocks assignment monopolization

Carol is fast. A maintainer assigns her 4 issues in Org D — her org assignment
count hits **4**. When the maintainer tries to assign her a 5th issue in Org D,
`assign_issue` returns `OrgAssignmentLimitReached` (error 7).

*Formal check:* `o_asgn[carol, D] = 4`. Pre-condition `asgn_count_before < A` fails (`4 < 4` is false). Call is rejected. `OrgAssignCount(carol, D) = 4 ≤ 4`. Invariant I2 holds. ✓

### Scenario 4 — Cross-org contributor stays under both caps

Dave holds 4 active assignments in Org E and 4 in Org F (**8 assignments**).
He also has 7 pending applications across Org G and Org H.

*Formal check:* `GlobalAppCount(dave) = 7 ≤ 15`. `OrgAssignCount(dave, E) = 4 ≤ 4`. `OrgAssignCount(dave, F) = 4 ≤ 4`. All invariants hold. ✓ He can still apply for 8 more issues but cannot receive more assignments in Org E or F until existing ones are completed.
