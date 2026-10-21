# Contributor FAQ

This FAQ answers the most common questions from contributors using the AlignmentDrips Wave platform — no blockchain experience required.

---

## Table of Contents

1. [Why am I seeing "Global application limit reached"?](#1-why-am-i-seeing-global-application-limit-reached)
2. [Why is the Apply button disabled?](#2-why-is-the-apply-button-disabled)
3. [How do I withdraw an application to free up a slot?](#3-how-do-i-withdraw-an-application-to-free-up-a-slot)
4. [Why do applications expire?](#4-why-do-applications-expire)
5. [Why was my application not found after it expired?](#5-why-was-my-application-not-found-after-it-expired)
6. [What happens when my assignment is revoked?](#6-what-happens-when-my-assignment-is-revoked)
7. [How do I check my current cap usage?](#7-how-do-i-check-my-current-cap-usage)
8. [Why can I only hold 4 active assignments in one organisation?](#8-why-can-i-only-hold-4-active-assignments-in-one-organisation)
9. [Can I apply to issues in multiple organisations at once?](#9-can-i-apply-to-issues-in-multiple-organisations-at-once)
10. [I was assigned but the issue shows "open" again — why?](#10-i-was-assigned-but-the-issue-shows-open-again--why)

---

## 1. Why am I seeing "Global application limit reached"?

**Short answer:** You already have 15 pending applications across all organisations and cannot open a new one until at least one is resolved.

**Longer explanation:**

The platform enforces a **global cap of 15 pending applications** per contributor across every organisation. The cap exists to keep the application pool fair — if a handful of contributors could hold hundreds of open applications it would prevent others from having a realistic chance of being assigned.

A "pending application" is any issue you have applied for that has not yet been:
- assigned to you (which converts it to an assignment), or
- withdrawn by you, or
- expired (see [Q4](#4-why-do-applications-expire)).

**What to do:**

1. Go to your profile and look at your current pending applications.
2. Withdraw applications for issues you are no longer interested in — see [Q3](#3-how-do-i-withdraw-an-application-to-free-up-a-slot).
3. Wait for a maintainer to assign one of your pending applications (this also frees a slot by converting the pending application into an assignment).
4. Wait for an older application to expire (applications last about 24 hours — see [Q4](#4-why-do-applications-expire)).

Once your pending application count drops below 15 you can apply again.

---

## 2. Why is the Apply button disabled?

The Apply button is disabled for one of the following reasons:

| Reason | What to check |
|---|---|
| You have reached the 15-application global cap | Withdraw some pending applications (see [Q3](#3-how-do-i-withdraw-an-application-to-free-up-a-slot)) |
| You have already applied to this issue | The button changes to "Withdraw" after you apply |
| You already have an active assignment for this issue | You cannot apply twice for an issue you are already assigned |
| Your wallet is not connected | Connect your Freighter wallet and try again |
| The issue is no longer open | The issue may have been assigned to another contributor or closed |

If the button remains disabled after connecting your wallet and you are below the cap, refresh the page to re-sync your state from the contract.

---

## 3. How do I withdraw an application to free up a slot?

**In the web interface:**

1. Navigate to **My Applications** in the top navigation bar.
2. Find the application you want to cancel.
3. Click the **Withdraw** button next to it.
4. Confirm the action in the dialog that appears.

Your global application count decreases by one immediately. You can now apply to a different issue.

**Using the CLI:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source your-account \
  -- withdraw_application \
  --contributor <YOUR_ADDRESS> \
  --org_id <ORG_ID> \
  --issue_id <ISSUE_ID>
```

Replace `<CONTRACT_ID>`, `<YOUR_ADDRESS>`, `<ORG_ID>`, and `<ISSUE_ID>` with the actual values. See [docs/contributor-guide.md](contributor-guide.md) for a full CLI walkthrough.

**Important:** You can only withdraw an application that is still pending. Once an application has been converted into an assignment, withdrawal is no longer possible — the assignment must be revoked by a maintainer.

---

## 4. Why do applications expire?

Applications are stored in **temporary storage** on the Stellar blockchain, which means they have a built-in time-to-live (TTL). By default, each application expires after approximately **24 hours** (17 280 ledgers on Stellar testnet).

The TTL exists for two reasons:

1. **Storage cost.** Blockchain storage is not free. Temporary data that is no longer relevant gets pruned automatically, keeping contract storage lean and costs low.
2. **Fairness.** An application that sits open indefinitely would block a slot in the global cap even if the contributor has lost interest. TTL expiry clears stale applications automatically.

**Extending a TTL:** If you applied to an issue but the assignment hasn't happened yet and your application is approaching expiry, you can extend the TTL by re-applying or using the `extend_application_ttl` contract function. The platform UI shows a warning banner when an application is close to expiry.

---

## 5. Why was my application not found after it expired?

If you see an error like **"ApplicationNotFound"** after a long gap since applying, your application most likely expired due to TTL.

When an application expires:
- The entry is removed from on-chain storage automatically.
- Your global application count decreases by one.
- The issue becomes open for other contributors to apply.

**What to do:** Re-apply to the issue. If the issue is still open you will see the Apply button available again (assuming you are below the cap). The error is not a bug — it is the expected behaviour of the expiry mechanism.

If you need to work on a long-running issue and are worried about expiry, ask the maintainer to assign the issue to you before the TTL elapses. Once assigned, the assignment is stored in persistent storage and does not expire.

---

## 6. What happens when my assignment is revoked?

A maintainer can revoke an active assignment for reasons such as extended inactivity, a change in project priorities, or a policy violation.

When an assignment is revoked:

1. The assignment entry is removed from on-chain storage.
2. Your **per-organisation assignment count** decreases by one, freeing a slot.
3. The issue returns to **open** status and other contributors can apply.
4. Your **global application count is not affected** — revocation does not restore a pending application, because the original application was consumed when you were assigned.

You will receive a notification in the platform (and, where configured, by email) when a revocation occurs. You are free to re-apply to the same issue immediately, subject to the cap limits.

If you believe a revocation was made in error, contact the maintainer directly via the issue thread or the organisation's communication channel.

---

## 7. How do I check my current cap usage?

**In the web interface:**

The capacity bar in the top-right of your profile shows:
- **Pending applications:** `X / 15` — how many of your 15 global slots are in use.
- **Active assignments per org:** `Y / 4` — how many active assignments you hold in a specific organisation.

Hover over either bar for a breakdown by organisation.

**Using the CLI:**

```bash
# Global pending application count
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_global_application_count \
  --contributor <YOUR_ADDRESS>

# Per-org assignment count
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_org_assignment_count \
  --contributor <YOUR_ADDRESS> \
  --org_id <ORG_ID>
```

These are read-only calls — they do not require signing and do not cost any XLM.

**Using the REST API:**

```
GET /contributors/<YOUR_ADDRESS>/applications/count
GET /contributors/<YOUR_ADDRESS>/orgs/<ORG_ID>/assignments/count
```

See [docs/api-reference.md](api-reference.md) for full request/response details.

---

## 8. Why can I only hold 4 active assignments in one organisation?

The **per-organisation assignment cap of 4** ensures that no single contributor can monopolise an organisation's bandwidth. Each active assignment represents work that is in progress and blocking other contributors from taking the issue.

The cap applies per organisation — you can hold up to 4 assignments in Organisation A and another 4 in Organisation B simultaneously, for a theoretical maximum of 4 × (number of orgs) active assignments.

If you are at your org cap (4/4) and want to take on a new issue in that same organisation:
1. Complete one of your current assignments — the maintainer must mark it complete.
2. Ask the maintainer to revoke an assignment you no longer plan to complete.

The org cap cannot be raised by individual contributors. Organisations may request a cap increase through the governance process described in [docs/runbooks/cap-emergency-increase.md](runbooks/cap-emergency-increase.md).

---

## 9. Can I apply to issues in multiple organisations at once?

Yes. The global cap of 15 pending applications covers all organisations combined. You can spread those 15 applications however you like:

- 15 applications in one org
- 5 applications each in 3 orgs
- 1 application in each of 15 different orgs

The per-org **assignment** cap (4) only applies once you are assigned — not during the application phase.

---

## 10. I was assigned but the issue shows "open" again — why?

If an issue that you were assigned to now shows as "open" again, one of the following occurred:

1. **Your assignment was revoked** by a maintainer (see [Q6](#6-what-happens-when-my-assignment-is-revoked)).
2. **The assignment was completed** by the maintainer — this closes the work and marks the issue resolved.
3. **A data sync delay** — the UI polls the contract state periodically. Refresh the page to get the latest state.
4. **Counter inconsistency** — in rare cases a migration or tooling bug can leave the on-chain state inconsistent. If you believe your assignment was incorrectly removed, contact the platform maintainers with your contributor address and the `(org_id, issue_id)` pair so they can run `check_consistency` on the contract.

---

## Still stuck?

- Read the full [Contributor Guide](contributor-guide.md) for a step-by-step CLI walkthrough.
- Check the [Error Reference](error-reference.md) for technical details on each error code.
- Ask in the `#contributors` channel in the community Discord.
