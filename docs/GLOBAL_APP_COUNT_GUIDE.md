# Issue #9: Global Application Count Indicator Guide

## Overview

WorkloadGovernor enforces a global cap of **max 15 pending applications** per contributor across all organizations.

This module implements a global application count indicator in the UI (sidebar badge and apply button guard) that prominently displays the contributor's pending application count, warns visually when approaching the limit, and blocks new application submissions when the limit of 15 is reached.

## Features

- **On-Connect & Event Queries**: Queries `get_global_application_count(contributor)` on wallet connection and updates automatically after each `apply` or `withdraw` state change.
- **Sidebar Count Badge**: Displays pending count formatted as `X/15` (e.g. `3/15`).
- **Visual Warnings**:
  - `0-12`: Standard blue badge status.
  - `13-14`: Amber warning badge with `⚠️` icon notifying contributor they are near the cap.
  - `15`: Crimson danger badge with `🚫` icon indicating the global cap has been reached.
- **Blocked Apply Button**: When count is 15, the "Apply" button is disabled with an explanatory tooltip (`You have reached the global limit of 15 pending applications. Withdraw an existing application to apply for new issues.`).

## Contract Interface

```rust
pub fn get_global_application_count(env: Env, contributor: Address) -> u32;
```

## Component Usage Example

```tsx
import { SidebarApplicationBadge } from './components/SidebarApplicationBadge';
import { ApplyForIssueButton } from './components/ApplyForIssueButton';

// Sidebar
<SidebarApplicationBadge currentCount={globalAppCount} maxLimit={15} />

// Issue card apply action
<ApplyForIssueButton
  contributorAddress={connectedAddress}
  orgId="alignment-drips"
  issueId={99}
  globalAppCount={globalAppCount}
  onApplyContractCall={async (contributor, orgId, issueId) => {
    return await contractClient.apply_for_issue(contributor, orgId, issueId);
  }}
  onStateChanged={refreshGlobalAppCount}
/>
```

## Acceptance Criteria Checklist

- [x] Application count queries accurately and updates after each apply/withdraw state change.
- [x] Visual warning appears at 13+ pending applications.
- [x] Apply button disabled at 15 with explanatory tooltip.
