# Fairness Model — Plain-English Explainer

This page explains why the WorkloadGovernor platform has contribution limits,
how those limits work in practice, and what to do when you run into them.

It is written for contributors who want a clear, jargon-free explanation. If
you want the formal proof with set-theory notation, see
[docs/fairness-model.md](fairness-model.md).

---

## Why do limits exist?

Open-source platforms have a well-known problem: a small group of fast or
well-connected developers can grab most of the available tasks before anyone
else even sees them. This does not mean those developers are bad actors — they
are just faster. But the result is that newer or slower contributors never get
a chance.

WorkloadGovernor solves this with two simple rules enforced directly on-chain:

1. **You can only hold 15 pending applications at once** — across all
   organisations combined.
2. **You can only hold 4 active assignments at once in any single organisation.**

That is it. Two numbers. Here is what each one means and why it was chosen.

---

## The two caps explained

### The global application cap — 15

An *application* is when you raise your hand and say "I'd like to work on this
issue." Before a maintainer has looked at your request, it sits in a *pending*
state.

The cap of 15 means you can have at most 15 of those pending requests open at
the same time, spread across as many organisations as you like. Once you hit
15, you need to either wait for a maintainer to act on one of your applications
(which clears it from your pending count) or withdraw one yourself.

**Why 15?** It is high enough that an active contributor can meaningfully
explore opportunities across multiple organisations, but low enough that one
person cannot blanket every available issue and block others from applying.

**Key point:** Once you are *assigned* an issue, that application is gone from
your pending count. Assignments do not count towards the 15 — only pending
(unanswered) applications do.

### The org assignment cap — 4

An *assignment* is when a maintainer says "yes, this issue is yours." You now
have a work slot in that organisation.

The cap of 4 means you can hold at most 4 active work slots in any single
organisation at the same time. There is no global assignment cap — if you are
working across multiple organisations, you can hold 4 in each one.

**Why 4?** It prevents one contributor from monopolising every task in an
organisation. A maintainer cannot hand all available issues to their favourite
contributor, leaving nothing for anyone else.

---

## How the two caps interact

The global cap and the org cap are independent checks that apply at different
stages:

| Stage | What is checked |
|---|---|
| You apply for an issue | Global pending count must be below 15 |
| A maintainer assigns you an issue | Your org assignment count must be below 4 |

A pending application and an active assignment are different things, tracked
separately. Getting assigned actually *lowers* your pending count (the
application is consumed) and *raises* your org assignment count by one.

---

## Worked example: Alice applies across three organisations

Let's follow Alice through a realistic session.

### Starting state

Alice has a fresh account. Both her pending count and her assignment counts are
zero.

```
Global pending applications:  0 / 15
Org A assignments:             0 / 4
Org B assignments:             0 / 4
Org C assignments:             0 / 4
```

### Alice applies for 10 issues

She finds 10 interesting issues: 4 in Org A, 3 in Org B, and 3 in Org C.
She applies for all of them.

```
Global pending applications:  10 / 15   ← 4+3+3, well under the cap
Org A assignments:              0 / 4   ← no maintainer has acted yet
Org B assignments:              0 / 4
Org C assignments:              0 / 4
```

All 10 applications succeed. She has 5 more slots she could use.

### Maintainer in Org A assigns Alice two issues

The maintainer converts two of her Org A applications into assignments. Each
one removes a pending application and adds an assignment.

```
Global pending applications:   8 / 15   ← dropped from 10 to 8
Org A assignments:              2 / 4   ← gained 2 work slots
Org B assignments:              0 / 4
Org C assignments:              0 / 4
```

### Alice tries to apply for 8 more issues in Org A

She finds 8 more issues in Org A and applies for them. After 7 applications,
her pending count hits 15.

```
After 7 more applications:
Global pending applications:  15 / 15   ← at the cap
Org A assignments:              2 / 4
Org B assignments:              0 / 4
Org C assignments:              0 / 4
```

When she tries to apply for the 8th issue she gets an error:
**GlobalApplicationLimitReached**. The contract is protecting the other
contributors.

### Alice frees a slot and continues

Alice has two options:

- **Withdraw one of her pending applications** that she is less interested in.
- **Wait for a maintainer to assign or reject** one of her existing applications.

She withdraws her least-favourite Org B application. Her count drops to 14 and
she can apply for the 8th Org A issue.

```
After withdrawing one Org B application:
Global pending applications:  14 / 15
Org A assignments:              2 / 4
Org B assignments:              0 / 4
Org C assignments:              0 / 4
```

### Org A maintainer assigns Alice two more issues — and then tries a third

The Org A maintainer assigns her two more issues. Her Org A assignment count
goes from 2 to 4.

```
Global pending applications:  12 / 15   ← 2 more applications consumed
Org A assignments:              4 / 4   ← at the per-org cap
Org B assignments:              0 / 4
Org C assignments:              0 / 4
```

When the maintainer tries to assign Alice a 5th Org A issue, the contract
blocks it with **OrgAssignmentLimitReached**. Alice is already holding 4 Org A
work slots. To receive another Org A assignment, she must complete or have
revoked at least one of her current ones.

**Note:** Alice can still receive assignments in Org B and Org C — the cap of 4
is per-organisation, not global.

### Summary of Alice's session

| Action | Global pending | Org A assigned |
|---|---|---|
| Start | 0 | 0 |
| Apply for 10 issues (4A, 3B, 3C) | 10 | 0 |
| Maintainer assigns 2 in Org A | 8 | 2 |
| Apply for 7 more in Org A | 15 | 2 |
| Withdraw 1 Org B application | 14 | 2 |
| Apply for 1 more in Org A | 15 | 2 |
| Maintainer assigns 2 more in Org A | 13 | 4 |
| Try to apply — blocked (15/15) | blocked | 4 |

---

## Applications expire — what that means for you

Pending applications use *temporary storage*. They automatically disappear
after roughly **24 hours** if nothing happens to them.

When an application expires:
- It is gone. `has_applied` returns `false` for that issue.
- Your pending count naturally drops by one (the counter expires alongside
  the application entry).
- You do not need to do anything — the slot frees itself.

**If you want to keep an application alive** during a slow review cycle, call
`extend_application_ttl`. Anyone can call this on your behalf, so a friend or
a bot can keep your applications alive if you are away.

Assignments, on the other hand, **never expire**. Once you are assigned an
issue, that work slot is yours until a maintainer marks it complete or revokes
it.

---

## How to check your current counts

You can check your caps at any time — no authentication needed:

### Check global pending count

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  -- get_global_application_count \
  --contributor "$CONTRIBUTOR_ADDRESS"
```

Returns a number from 0 to 15.

### Check remaining global capacity

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  -- get_global_application_capacity \
  --contributor "$CONTRIBUTOR_ADDRESS"
```

Returns how many more applications you can submit (i.e. 15 minus your current
count).

### Check assignment count in a specific organisation

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network testnet \
  -- get_org_assignment_count \
  --contributor "$CONTRIBUTOR_ADDRESS" \
  --org_id <ORG_ID>
```

Returns a number from 0 to 4 for that organisation.

---

## What to do when you hit a cap

### Hit the global application cap (error 6)

You have 15 pending applications open.

Options, fastest first:
1. **Withdraw a low-priority application.** Use `withdraw_application` on any
   pending application you are no longer keen on. Your count drops immediately
   and you can apply elsewhere.
2. **Wait for a maintainer to act.** When a maintainer assigns one of your
   applications, that application is consumed and your count drops by one.
3. **Wait for an application to expire.** If you have applications on issues
   with no active maintainer, they will disappear after ~24 hours, freeing the
   slot automatically.

### Hit the org assignment cap (error 7)

You have 4 active assignments in that organisation.

Only a maintainer can free this cap — you cannot withdraw an assignment
yourself. Options:
1. **Ask the maintainer to complete one of your existing assignments** once the
   work is done. That frees a slot.
2. **Ask the maintainer to revoke an assignment** if the work is no longer
   needed or you want to step back. That also frees a slot.
3. **Work on your existing assignments.** Once you finish them the maintainer
   will mark them complete, and your count drops.
4. **Apply in a different organisation.** The org cap is per-org, not global.
   You can receive new assignments in any org where you are below 4.

---

## Frequently asked questions

### Why can't I apply — what does "GlobalApplicationLimitReached" mean?

You already have 15 pending applications waiting for a maintainer to respond.
The platform limits each contributor to 15 at a time so that one person cannot
hold every available issue at once.

To fix it: withdraw at least one application you are not committed to
(`withdraw_application`), or wait for a maintainer to assign or ignore one of
your existing applications.

### How long does a pending application last?

About 24 hours. Applications use expiring on-chain storage. If a maintainer has
not acted on your application within that window, it disappears automatically
and your slot frees up.

Call `extend_application_ttl` to reset the clock if you want to keep an
application alive longer.

### My application just disappeared — what happened?

Its 24-hour timer ran out and it was cleaned up automatically. This is normal.
You can apply again at any time by calling `apply_for_issue` with the same
arguments.

To prevent this in future, extend the TTL periodically, especially for issues
in organisations with slow review cycles.

### How many issues can I be assigned at once?

Up to 4 per organisation, with no global limit on assignments. If you work
across 3 organisations you could hold up to 12 active assignments simultaneously
(4 in each).

Within a single organisation, the cap of 4 is absolute — only a maintainer
completing or revoking an existing assignment can free a slot.

### Why do active assignments not count against the 15-application cap?

The 15-application cap is specifically for *pending* (unanswered) applications
— requests you have made that are still waiting for a maintainer's decision.
Once you are assigned, you have moved past the speculative phase and are doing
real work. Counting active assignments against the pending cap would penalise
productive contributors who are actively delivering.

The per-organisation assignment cap (4) handles the concern about monopolising
work within a single org separately.

---

## Quick-reference summary

| Concept | Value | What uses it | Freed by |
|---|---|---|---|
| Global application cap | 15 | Pending (unanswered) applications | Withdrawal, assignment, or expiry (~24 h) |
| Org assignment cap | 4 per org | Active assignments | Maintainer completing or revoking |

When you are **assigned**, one slot is freed from your global application count
and one slot is consumed in your org assignment count. The net effect: applying
for issues and getting assigned keeps both caps cycling naturally.

---

## Further reading

- [docs/contributor-guide.md](contributor-guide.md) — CLI commands for
  applying, checking status, extending TTL, and withdrawing
- [docs/faq.md](faq.md) — answers to the most common platform questions
- [docs/fairness-model.md](fairness-model.md) — the formal invariant proofs
  and gaming-vector analysis for protocol designers
