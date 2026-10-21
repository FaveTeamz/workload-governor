# CI/CD Guide

This document covers the GitHub Actions CI setup, Slack integration, and deployment workflows.

## CI Workflows

| Workflow | File | Triggers |
|---|---|---|
| Backend CI | `ci.yml` | Push and PR to `main` |
| Frontend CI | `frontend-ci.yml` | Push and PR to `main` |
| Contract CI | `contract-ci.yml` | Push and PR to `main` |
| Backend Integration | `backend-integration.yml` | Push and PR to `main` |
| Staging Deploy | `staging-deploy.yml` | Push to `main` |

## Slack Notifications

CI failures on `main` are announced in Slack automatically. The reusable workflow is in `.github/workflows/notify-slack.yml`.

### What triggers a notification

- **Failure**: Any of the three main CI jobs (`Backend CI`, `Frontend CI`, `Contract CI`) fails on a direct push to `main`.
- **Restored**: The same CI job passes again on `main` after a previous failure.
- **No notification on PRs**: Notifications are intentionally suppressed on pull request runs to reduce noise. Only merges to `main` trigger alerts.

### Message format

**Failure message** (red):
```
❌ *Backend CI* failed on `main`
Commit:  abc1234  (link to run)
Author:  github-username
Message: fix: correct TTL calculation
```

**Restored message** (green):
```
✅ *Backend CI* is green again on `main`
```

### Setting up the webhook

1. Go to your Slack workspace → **Apps** → **Incoming WebHooks** → **Add to Slack**.
2. Choose the channel that should receive CI alerts (e.g., `#ci-alerts`).
3. Copy the **Webhook URL**.
4. In the GitHub repository go to **Settings → Secrets and variables → Actions**.
5. Create a new repository secret named `SLACK_WEBHOOK_URL` and paste the webhook URL as its value.

Once the secret is set, the next push to `main` that results in a CI failure will send a notification to the configured channel.

If the `SLACK_WEBHOOK_URL` secret is absent or empty, the notification step is skipped silently — no workflow failure is introduced.

### Disabling notifications

Remove or clear the `SLACK_WEBHOOK_URL` secret in the repository settings. All notification steps check for the secret before running.

## Deployment

See [`docs/deployment-runbook.md`](deployment-runbook.md) for full staging and production deployment instructions.

### Staging

The `staging-deploy.yml` workflow deploys automatically to the staging environment on every push to `main`.

### Production

Production deployments are manual. Follow the runbook in `docs/deployment-runbook.md`.

## Contract Deployment

The `contract-ci.yml` workflow:
1. Builds the WASM binary.
2. Runs all Rust unit and property-based tests.
3. Runs mutation testing (`cargo-mutants`).
4. On push to `main`: optimizes the WASM and deploys to the Stellar testnet, then runs the CI smoke tests.

See [`docs/deployment-runbook.md`](deployment-runbook.md) for mainnet deployment steps.
