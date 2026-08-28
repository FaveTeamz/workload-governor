# Issue #12: Application TTL Extension Guide

## Overview

In the Workload Governor contract, pending applications use temporary storage entries to enforce workload fairness caps. To prevent pending applications from expiring unexpectedly while under review, contributors or community members can invoke `extend_application_ttl(contributor, org_id, issue_id)`.

This feature provides UI components that display an accurate TTL countdown per application card and enable an "Extend TTL" button when an application approaches expiry.

## Features

- **Accurate Countdown**: Displays live remaining time until application TTL expiration (days, hours, minutes, seconds).
- **Configurable Near-Expiry Threshold**: Button remains disabled until TTL is within the configured window (e.g. 24 hours).
- **Permissionless Contract Invocation**: Invokes `extend_application_ttl` on the Soroban contract.
- **Dynamic UI Update**: Immediately updates the remaining TTL display upon transaction confirmation.

## Contract Interface

```rust
pub fn extend_application_ttl(env: Env, contributor: Address, org_id: Symbol, issue_id: u32);
```

## Component Usage Example

```tsx
import { ApplicationCard } from './components/ApplicationCard';

<ApplicationCard
  contributorAddress="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  orgId="alignment-drips"
  issueId={42}
  title="Refactor Soroban Storage Keys"
  submittedAtTimestamp={1719200000}
  initialExpiryTimestamp={1719286400}
  nearExpiryThresholdSeconds={86400}
  onExtendTTLContractCall={async (contributor, orgId, issueId) => {
    // Invoke Soroban contract transaction via Stellar SDK
    return await contractClient.extend_application_ttl(contributor, orgId, issueId);
  }}
/>
```

## Acceptance Criteria Checklist

- [x] TTL countdown per application card is accurate and updates live.
- [x] "Extend TTL" button invokes `extend_application_ttl`.
- [x] Button disabled when TTL is not near expiry (with informative tooltip).
- [x] TTL display updates upon successful extension.
