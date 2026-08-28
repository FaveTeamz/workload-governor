# Issue #10: Organization Registration & Management Page Guide

## Overview

Maintainers are authorized to manage issue assignments and completions for specific organizations within the Workload Governor contract. Only the contract admin can register maintainers via the `register_maintainer(admin, maintainer, org_id)` function.

This module adds a dedicated Admin Organization Management Page to allow contract administrators to register maintainers and view maintainer registries across all organizations.

## Features

- **Admin-Only Route Guard**: Checks connected wallet address against contract admin address (`storage::get_admin`). Non-admins are immediately redirected to the home route.
- **Address Validation**: Validates maintainer Stellar addresses before transaction submission (56 characters starting with `G`, valid base32 string format).
- **On-Chain Invocation**: Submits `register_maintainer` transactions.
- **Maintainer Directory**: Displays registered maintainers per organization and automatically refreshes after registration.

## Contract Interface

```rust
pub fn register_maintainer(env: Env, admin: Address, maintainer: Address, org_id: Symbol);
```

## Component Usage Example

```tsx
import { OrgManagementPage } from './pages/OrgManagementPage';

<OrgManagementPage
  connectedWalletAddress={userWalletAddress}
  adminAddress={contractAdminAddress}
  onRegisterMaintainer={async (admin, maintainer, orgId) => {
    return await contractClient.register_maintainer(admin, maintainer, orgId);
  }}
  fetchRegisteredMaintainers={async () => {
    return await api.getRegisteredMaintainers();
  }}
  onNavigateHome={() => router.push('/')}
/>
```

## Acceptance Criteria Checklist

- [x] Non-admin users are redirected to home route.
- [x] Maintainer address input validates Stellar address format before submission.
- [x] Form invokes `register_maintainer` on Soroban contract.
- [x] Registered maintainers per org listed in UI and refreshed automatically.
