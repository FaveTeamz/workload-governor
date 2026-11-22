# Cap Emergency Increase Runbook

This document describes how to raise the global application cap via the
on-chain governance mechanism introduced in #600.

## Background

The global application cap (default: 15) limits how many pending applications
a contributor may hold simultaneously. During high-volume events (hackathons,
sprints) the cap may need a temporary increase. Rather than a full contract
upgrade, a quorum of registered maintainers can vote to change it.

## Governance Rules

| Parameter | Value |
|---|---|
| Proposal TTL | ~7 days (`PROPOSAL_TTL_LEDGERS = 120_960` ledgers at 5 s/ledger) |
| Quorum | >= 3 total votes (yes + no) |
| Approval threshold | > 50% yes votes |
| Eligible voters | Any registered maintainer (for any org) |

## Step-by-Step: Increase the Cap

### 1 — Create a proposal

Any registered maintainer can open a proposal:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network mainnet \
  --source <maintainer-account> \
  -- propose_cap_change \
  --maintainer <MAINTAINER_ADDRESS> \
  --org_id <ORG_ID> \
  --new_global_cap 25
```

Note the returned `proposal_id` from the `CapProposed` event.

### 2 — Gather votes

Share the `proposal_id` with other registered maintainers. Each maintainer
votes once:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network mainnet \
  --source <maintainer-account> \
  -- vote_cap_change \
  --maintainer <MAINTAINER_ADDRESS> \
  --org_id <ORG_ID> \
  --proposal_id <PROPOSAL_ID> \
  --approve true
```

### 3 — Execute the proposal

Once quorum and approval threshold are met, anyone can execute:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network mainnet \
  --source <any-account> \
  -- execute_cap_change \
  --executor <EXECUTOR_ADDRESS> \
  --proposal_id <PROPOSAL_ID>
```

Verify the `CapChanged` event was emitted with the new cap value.

### 4 — Confirm the change

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network mainnet \
  -- get_global_cap
```

## Error Reference

| Code | Variant | Trigger |
|---|---|---|
| 15 | `ProposalNotFound` | `proposal_id` does not exist |
| 16 | `ProposalExpired` | Proposal TTL elapsed before execution |
| 17 | `AlreadyVoted` | Maintainer voted twice on same proposal |
| 18 | `QuorumNotMet` | Total votes < 3 at execution time |
| 19 | `InsufficientApproval` | yes votes <= 50% of total |

## Events

| Event | Topics | Data |
|---|---|---|
| `CapProposed` | `("cap_prop", proposer)` | `(proposal_id, new_global_cap)` |
| `CapVoted` | `("cap_vote", voter)` | `(proposal_id, approve)` |
| `CapChanged` | `("cap_exec", executor)` | `(proposal_id, new_global_cap)` |

## Reverting a Cap Change

A cap reduction follows the same proposal → vote → execute flow with a lower
`new_global_cap` value. There is no special revert function.
