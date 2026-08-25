# Runbook: Emergency Global Cap Increase

**Function:** `emergency_set_global_cap(admin, new_cap)`  
**Event emitted:** `emrg_cap`  
**Error codes:** `2` (NotInitialized), `3` (UnauthorizedAdmin), `12` (CapOutOfRange)  
**Severity:** High — modifies fairness enforcement for all active contributors  
**Last reviewed:** 2026-07-27

---

## 1. When to Use This Runbook

Use `emergency_set_global_cap` **only** when all of the following conditions are true:

1. An active Wave is in progress.
2. A statistically unusual number of contributors are hitting the global application cap (default: 15).
3. The cap is causing legitimate contributors to be blocked — not just individual edge cases.
4. There is insufficient time to deploy a contract upgrade before the Wave closes.

**Do not use this function** for:
- Routine cap changes between Waves (use a contract upgrade instead).
- Responding to a single contributor's complaint without broader signal.
- Raising the cap above 100 (the contract enforces this hard limit).

---

## 2. Decision Process

### 2.1 Triage checklist (complete before calling the function)

- [ ] Query on-chain: what fraction of active contributors have hit the cap in the last 24 h?
  ```bash
  # Example: count emrg_cap and app_sub events over the past 24 h using your event indexer
  stellar events --id <CONTRACT_ID> --network mainnet --start-ledger <LEDGER_24H_AGO> \
    | jq 'select(.topics[0] == "app_sub")'
  ```
- [ ] Confirm the cap is the limiting factor, not the org assignment limit (code 7) or other errors.
- [ ] Identify the proposed new cap: must satisfy `current_cap < new_cap ≤ 100`.
- [ ] Document the justification (number of blocked contributors, Wave size, date/time).

### 2.2 Approval required

| Environment | Approver |
|-------------|----------|
| Testnet     | On-call engineer (self-approval acceptable for testing) |
| Mainnet     | Two approvals: on-call engineer + Wave Programme Lead |

Record approval in the incident channel with the format:
```
APPROVED: emergency_set_global_cap new_cap=<N>
Approver 1: @<handle> at <ISO-8601 timestamp>
Approver 2: @<handle> at <ISO-8601 timestamp>
Justification: <brief description>
```

---

## 3. Execution

### 3.1 Pre-flight

```bash
# 1. Confirm the current effective cap
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network mainnet \
  -- get_global_application_capacity \
  --contributor <ANY_CONTRIBUTOR_ADDRESS>
# Returns remaining capacity for that contributor; current cap = capacity + their current count

# 2. Confirm admin key is available
stellar keys ls
```

### 3.2 Invoke

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network mainnet \
  --source <admin-account> \
  -- emergency_set_global_cap \
  --admin <ADMIN_ADDRESS> \
  --new_cap <NEW_CAP>
```

### 3.3 Verify

Confirm the `emrg_cap` event was emitted with the expected `(old_cap, new_cap)` data:

```bash
stellar events \
  --id <CONTRACT_ID> \
  --network mainnet \
  --start-ledger <LEDGER_BEFORE_TX> \
  | jq 'select(.topics[0] == "emrg_cap")'
```

Expected output shape:
```json
{
  "topics": ["emrg_cap", "<ADMIN_ADDRESS>"],
  "data": [<OLD_CAP>, <NEW_CAP>]
}
```

Confirm contributors previously blocked can now submit applications:
```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network mainnet \
  -- get_global_application_capacity \
  --contributor <PREVIOUSLY_BLOCKED_ADDRESS>
# Should now return > 0
```

---

## 4. Rollback Procedure

The cap can be lowered back to any value in `[0, 100]` by calling `emergency_set_global_cap` again with the original (or lower) value.

**Important:** Lowering the cap does **not** retroactively revoke existing applications. Contributors who already submitted applications above the new lower cap will keep those applications. The lower cap only prevents new submissions.

### 4.1 Rollback to default (15)

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network mainnet \
  --source <admin-account> \
  -- emergency_set_global_cap \
  --admin <ADMIN_ADDRESS> \
  --new_cap 15
```

### 4.2 Rollback verification

```bash
stellar events \
  --id <CONTRACT_ID> \
  --network mainnet \
  --start-ledger <ROLLBACK_LEDGER> \
  | jq 'select(.topics[0] == "emrg_cap")'
# data[1] should equal 15 (or your target rollback value)
```

---

## 5. Monitoring Alert

### 5.1 Alert definition

**Alert name:** `EmergencyCapChangedFrequently`  
**Condition:** The `emrg_cap` event is emitted more than **twice within any rolling 24-hour window** on the same contract.  
**Severity:** `P1 — Critical`  
**Notification channels:** PagerDuty on-call rotation + `#wave-incidents` Slack channel

### 5.2 CloudWatch / event indexer rule (pseudocode)

```
METRIC: count of events where topics[0] == "emrg_cap"
        grouped by CONTRACT_ID
        over rolling window of 17,280 ledgers (~24 h at 5 s/ledger)

ALARM:  metric > 2
ACTION: PagerDuty alert + Slack webhook to #wave-incidents
```

### 5.3 What to investigate when the alert fires

1. Open the on-chain event log and list all `emrg_cap` events in the window — confirm each was intentional.
2. If any change was not authorised, treat it as a **security incident**: the admin key may be compromised. Escalate immediately to the security channel and consider a contract upgrade to rotate the admin.
3. If all changes were authorised, assess whether a contract upgrade to raise the compile-time default is warranted so that future waves do not require repeated emergency overrides.

---

## 6. Post-Incident Actions

After any emergency cap change on mainnet:

1. File a post-mortem issue within 48 hours covering: what triggered the change, what the actual contributor impact was, and whether the default cap should be revised.
2. Update the `GLOBAL_APP_LIMIT` constant in `src/storage.rs` if the emergency cap better reflects the intended fairness model for future Waves, and schedule a contract upgrade.
3. Archive the approval record from the incident channel for audit purposes.
