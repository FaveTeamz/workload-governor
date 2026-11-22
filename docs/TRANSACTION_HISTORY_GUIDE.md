# Issue #11: Contributor Transaction History Log Guide

## Overview

Contributors require visibility into past on-chain actions (applications submitted, applications withdrawn, issues assigned, assignments completed, and assignments revoked).

This module indexes Soroban contract events via Horizon / Soroban RPC and presents an interactive transaction history log UI with client-side filtering and CSV export capabilities.

## Features

- **Horizon Event Indexing**: Parses contract events (`emit_application_submitted`, `emit_application_withdrawn`, `emit_issue_assigned`, `emit_assignment_completed`, `emit_assignment_revoked`).
- **Chronological Event List**: Displays events with formatted UTC timestamps, action type badges, Org ID, Issue ID, and transaction hashes linking to Stellar Expert.
- **Client-Side Filtering**: Filters instantly by event type or organization ID without making additional API network requests.
- **CSV Export**: Exports all currently visible/filtered event rows into a formatted CSV file (`RFC-4180`).

## Component Usage Example

```tsx
import { TransactionHistoryLog } from './components/TransactionHistoryLog';

<TransactionHistoryLog
  events={indexedEventsList}
  isLoading={false}
  onRefreshEvents={async () => {
    await fetchHorizonEvents();
  }}
/>
```

## Acceptance Criteria Checklist

- [x] On-chain events load from Horizon/Soroban RPC and display accurately.
- [x] Event type and Organization ID filters narrow the list instantaneously without extra network requests.
- [x] CSV export includes all currently visible rows.
