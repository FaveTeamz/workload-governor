# Contributor Guide

## Welcome to WorkloadGovernor

This guide is designed to help new contributors understand the platform, install Freighter, connect a wallet, find issues, apply, and track status.

## WorkloadGovernor fairness model

WorkloadGovernor enforces two independent caps:

- **Global application cap: 15 pending applications** across all organizations.
- **Org assignment cap: 4 active assignments** per organization.

### What this means for contributors

- A contributor may only have up to 15 total open applications across every org.
- When a maintainer assigns one of your applications, the global application count decreases by one and the assignment count for that org increases by one.
- You may not receive more than 4 active assignments in the same org at any time.

If caps are reached:

- When the global cap is reached, `apply_for_issue` fails with `GlobalApplicationLimitReached`. You must withdraw an existing application or wait for one to be assigned before applying again.
- When the org cap is reached, `assign_issue` fails with `OrgAssignmentLimitReached`. A maintainer must complete or revoke one of your assignments in that org before you can receive another.

## Install Freighter and connect your wallet

1. Install Freighter from the official website: https://www.freighter.app
2. Create or import a Stellar account.
3. Open your wallet and ensure it is connected to the correct network.
4. In the WorkloadGovernor UI, select `Connect wallet` and approve the connection in Freighter.

![Connect Freighter](screenshots/connect-freighter.png)

## Browse issues

1. Open the WorkloadGovernor app.
2. Navigate to the issue board or the main contributor dashboard.
3. Review the issue descriptions, organization, and status.
4. Choose an issue that matches your skills.

![Browse Issues](screenshots/browse-issues.png)

## Apply for an issue

1. Select the issue you want to work on.
2. Click `Apply`.
3. Approve the transaction in Freighter.
4. Your application is now pending.

![Apply for Issue](screenshots/apply-issue.png)

### What happens on apply

The contract runs `apply_for_issue`.

Relevant contract functions:

- `apply_for_issue` — submit a pending application.
- `get_global_application_count` — read the contributor's pending app count.
- `has_applied` — verify whether you have applied for a specific issue.
- `get_global_application_capacity` — how many more applications you may submit.

## Track application status

1. Use the contributor dashboard to review pending applications.
2. Look for application status badges or counts.
3. If needed, withdraw an application before it is assigned.

![Track Status](screenshots/track-status.png)

### Withdraw an application

1. Find the issue you previously applied to.
2. Click `Withdraw`.
3. Approve the transaction in Freighter.

Relevant contract functions:

- `withdraw_application` — cancel a pending application.
- `get_global_application_count` — verify the count decremented.

## What happens when caps are reached

### Global application cap reached

- `apply_for_issue` will fail if you already have 15 pending applications.
- The UI should prevent additional applications or show a disabled `Apply` button.
- Withdraw one pending application or wait for a maintainer to assign one of your issues.

### Org assignment cap reached

- A maintainer cannot assign you more than 4 active assignments in the same org.
- `assign_issue` will fail with `OrgAssignmentLimitReached` when the contributor already has 4 active assignments in that org.
- Complete or revoke one assignment in that org before taking on more.

## Contract functions overview

The following functions are relevant to contributor onboarding:

- `initialize` — admin-only contract setup.
- `register_maintainer` — admin-only maintainer registration.
- `apply_for_issue` — contributor submits an application.
- `withdraw_application` — contributor cancels an application.
- `assign_issue` — maintainer converts an application into an assignment.
- `complete_assignment` — maintainer marks an assignment complete.
- `revoke_assignment` — maintainer cancels an assignment.
- `extend_application_ttl` — anyone can refresh a pending application's TTL.
- `get_global_application_count` — read pending app count.
- `get_org_assignment_count` — read active assignment count.
- `has_applied` — check a specific application.
- `is_assigned` — check active assignment status.
- `get_org_assignment_capacity` — remaining assignment slots in an org.
- `get_global_application_capacity` — remaining application capacity.
- `is_org_assignment_limit_reached` — whether org assignment cap is hit.
- `global_app_limit_reached` — whether global app cap is hit.

## First contribution checklist

- Connect Freighter.
- Browse available issues.
- Apply for an issue within your caps.
- Use `has_applied` and `get_global_application_count` to verify your status.
- If the issue is assigned, ask the maintainer to complete it after work is done.

## Screenshot note

Replace the placeholder screenshot files in `docs/screenshots/` with actual UI captures before publishing.
