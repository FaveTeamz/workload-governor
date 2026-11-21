# Organisation Onboarding Guide

Step-by-step instructions for integrating a new GitHub organisation with the **AlignmentDrips Wave** platform powered by WorkloadGovernor.

> **Related docs**
> - [INTEGRATION_GUIDE.md](../INTEGRATION_GUIDE.md) — full technical API integration reference
> - [docs/api-reference.md](api-reference.md) — REST API endpoints
> - [docs/admin-guide.md](admin-guide.md) — platform admin operations
> - [docs/runbooks/](runbooks/) — incident and emergency runbooks

---

## Prerequisites

Before starting, confirm you have:

- GitHub **organisation admin** access (required to add webhooks).
- A funded **Stellar account** on testnet (for the maintainer address). Get testnet XLM from [friendbot](https://friendbot.stellar.org).
- The AlignmentDrips **platform admin API key** (request from the platform admin team).
- The deployed **WorkloadGovernor contract ID** for your target network (`testnet` or `mainnet`). The current IDs are in [`config/contracts.json`](../config/contracts.json).

---

## Step 1 — Register Your Organisation with AlignmentDrips

The platform admin must add your org to the platform registry before any contract operations can take place.

**Request** (send to platform admin team):

```
Org name (GitHub handle): <your-org>
Org display name:          <Human-readable name>
Target network:            testnet | mainnet
Org cap override:          (optional — default is 4 assignments per contributor)
```

The admin will respond with:
- Your `org_id` (a short symbol string, e.g. `"my-org"`)
- A confirmation that the org record is created in the backend database

You can verify the org exists via the API:

```bash
curl -H "Authorization: Bearer <admin-api-key>" \
  https://api.alignmentdrips.io/admin/orgs
```

---

## Step 2 — Register a Maintainer Address

Every org needs at least one registered maintainer on the smart contract. The maintainer address is the Stellar account that will call `assign_issue`, `complete_assignment`, and `revoke_assignment`.

```bash
# Replace placeholders with real values
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <admin-secret-key> \
  -- register_maintainer \
  --admin <ADMIN_ADDRESS> \
  --maintainer <MAINTAINER_STELLAR_ADDRESS> \
  --org_id <org_id>
```

Verify the maintainer is registered:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <any-account> \
  -- get_maintainer \
  --maintainer <MAINTAINER_STELLAR_ADDRESS> \
  --org_id <org_id>
# returns: true
```

> **Multiple maintainers:** Repeat this step for each maintainer. Each maintainer is authorised for a specific `org_id`; they cannot act on other orgs.

---

## Step 3 — Set Up the GitHub Webhook

The backend processes GitHub issue events via a webhook. This is what triggers issue state changes (opened, closed, assigned) to be reflected in WorkloadGovernor.

### 3a. Generate a webhook secret

```bash
# Generate a 32-byte random secret
openssl rand -hex 32
# Save this value — you will need it in steps 3b and 3c
```

### 3b. Add the webhook in GitHub

1. Go to your GitHub org: `https://github.com/organizations/<your-org>/settings/hooks`
2. Click **Add webhook**
3. Fill in:

   | Field | Value |
   |---|---|
   | Payload URL | `https://api.alignmentdrips.io/webhooks/github` |
   | Content type | `application/json` |
   | Secret | *(value from step 3a)* |
   | Events | Select **Let me select individual events**, then check: **Issues**, **Issue comments** |
   | Active | ✅ |

4. Click **Add webhook**. GitHub will send a ping event — the backend will respond with HTTP 200.

### 3c. Register the webhook secret with the platform

```bash
curl -X POST https://api.alignmentdrips.io/admin/orgs/<org_id>/webhook \
  -H "Authorization: Bearer <admin-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"secret": "<webhook-secret-from-3a>", "github_org": "<your-org>"}'
```

Confirm with:

```bash
curl -H "Authorization: Bearer <admin-api-key>" \
  https://api.alignmentdrips.io/admin/orgs/<org_id>
# "webhook_configured": true
```

---

## Step 4 — Configure the Org Cap (Optional)

The default per-org assignment cap is **4** concurrent assignments per contributor. If your org requires a different limit, request a cap change from the platform admin.

> **Important:** Cap changes are applied at the contract level via the `register_maintainer` metadata, not in the WASM logic — contact the platform admin team to discuss governance implications before requesting a cap above the global contract default.

To check the current cap via the API:

```bash
curl https://api.alignmentdrips.io/orgs/<org_id>/config
# {"org_id": "my-org", "assignment_cap": 4, ...}
```

---

## Step 5 — Test With a Sample Issue

Run an end-to-end test to confirm the integration is working.

### 5a. Create a test issue in your GitHub repo

```
Title:   [test] Onboarding smoke test
Body:    This issue is used to verify AlignmentDrips Wave onboarding.
Labels:  (none required)
```

Note the issue number (e.g. `#42`).

### 5b. Apply as a contributor

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <contributor-secret-key> \
  -- apply_for_issue \
  --contributor <CONTRIBUTOR_ADDRESS> \
  --org_id <org_id> \
  --issue_id 42
```

Verify the application was recorded:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <any-account> \
  -- has_applied \
  --contributor <CONTRIBUTOR_ADDRESS> \
  --org_id <org_id> \
  --issue_id 42
# returns: true
```

### 5c. Assign the issue as a maintainer

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <maintainer-secret-key> \
  -- assign_issue \
  --maintainer <MAINTAINER_ADDRESS> \
  --contributor <CONTRIBUTOR_ADDRESS> \
  --org_id <org_id> \
  --issue_id 42
```

Verify the assignment:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <any-account> \
  -- is_assigned \
  --contributor <CONTRIBUTOR_ADDRESS> \
  --org_id <org_id> \
  --issue_id 42
# returns: true
```

### 5d. Complete the assignment and clean up

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <maintainer-secret-key> \
  -- complete_assignment \
  --maintainer <MAINTAINER_ADDRESS> \
  --contributor <CONTRIBUTOR_ADDRESS> \
  --org_id <org_id> \
  --issue_id 42
```

Close the test issue in GitHub. The webhook should fire and the backend event log should reflect the state change.

---

## Step 6 — Monitor Health via the Dashboard

Once your org is live, use the AlignmentDrips dashboard and API to monitor activity.

**API health check:**

```bash
curl https://api.alignmentdrips.io/health
# {"status":"ok","db":"ok","redis":"ok"}
```

**View contributor assignment counts for your org:**

```bash
curl https://api.alignmentdrips.io/orgs/<org_id>/contributors
```

**View recent events for your org:**

```bash
curl -H "Authorization: Bearer <admin-api-key>" \
  "https://api.alignmentdrips.io/events?org_id=<org_id>&limit=20"
```

**CloudWatch / infrastructure alerts** (platform admins only):
See [infra/BRANCH-CLOUDWATCH.md](../infra/BRANCH-CLOUDWATCH.md) and the [incident response runbook](runbooks/incident-response.md).

---

## Step 7 — Go Live

When the smoke test passes and monitoring is confirmed:

1. Announce the integration to your contributors (link them to [docs/contributor-guide.md](contributor-guide.md)).
2. Remove the `[test]` label or close the smoke test issue.
3. Notify the platform admin team that your org is live so they can enable production monitoring.

---

## Onboarding Checklist

Use this checklist to track progress. Copy it into a GitHub issue when starting onboarding.

```
## AlignmentDrips Wave — Org Onboarding Checklist

### Prerequisites
- [ ] GitHub org admin access confirmed
- [ ] Stellar testnet account funded (friendbot)
- [ ] Platform admin API key obtained

### Setup Steps
- [ ] Step 1: Org registered with platform (org_id confirmed: _______)
- [ ] Step 2: Maintainer address registered on contract
- [ ] Step 3a: Webhook secret generated
- [ ] Step 3b: GitHub webhook added and ping responded HTTP 200
- [ ] Step 3c: Webhook secret registered with platform API
- [ ] Step 4: Org cap reviewed (default 4 — override if needed: _______)
- [ ] Step 5a: Test issue created (#_______)
- [ ] Step 5b: Test application submitted and verified (has_applied = true)
- [ ] Step 5c: Test assignment completed and verified (is_assigned = true)
- [ ] Step 5d: Assignment completed, test issue closed
- [ ] Step 6: Dashboard/API health check passing

### Go Live
- [ ] Step 7: Contributors notified
- [ ] Step 7: Platform admin team notified — org is live
- [ ] Test issue closed / cleaned up
```

---

## Support and Escalation

| Issue | Resource |
|---|---|
| Contract errors (error codes 1–13) | [docs/error-reference.md](error-reference.md) |
| Webhook not firing | GitHub org → Settings → Hooks → Recent Deliveries |
| Backend API errors | [docs/api-reference.md](api-reference.md) |
| Admin key rotation | [docs/runbooks/admin-key-rotation.md](runbooks/admin-key-rotation.md) |
| Emergency cap increase | [docs/runbooks/cap-emergency-increase.md](runbooks/cap-emergency-increase.md) |
| Incident response | [docs/runbooks/incident-response.md](runbooks/incident-response.md) |
| General questions | Open a GitHub issue or contact the platform admin team |
