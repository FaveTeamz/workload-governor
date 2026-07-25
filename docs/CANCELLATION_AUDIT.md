# Cancellation Audit Trail — Design Document

**Issue**: [#146](https://github.com/Chrisland58/SorobanPay/issues/146)  
**Date**: 2026-06-24  
**Status**: Implemented

---

## Problem

Subscription cancellations on **AlignmentDrips Wave** are only visible on-chain via Stellar events.  
Merchants have no off-chain query interface to see when a subscription ended, who triggered it, or why.

---

## Solution

A backend audit service (`CancellationAuditService`) persists every cancellation event to an off-chain store, giving merchants a queryable history of all cancellations with timestamps, subscription metadata, and optional reason text.

---

## Data Model

### `CancellationRecord`

| Field | Type | Description |
|---|---|---|
| `id` | `String` (UUID v4) | Unique audit record identifier |
| `org_id` | `String` | On-chain organization identifier |
| `issue_id` | `u64` | On-chain issue / subscription identifier |
| `contributor` | `String` | Stellar address of the subscriber |
| `cancelled_by` | `String` | Stellar address of the actor who cancelled |
| `cancelled_at` | `DateTime<Utc>` | UTC timestamp of the cancellation |
| `reason` | `Option<CancellationReason>` | Optional structured reason |
| `tx_hash` | `Option<String>` | Stellar transaction hash (if available) |

### `CancellationReason` (enum)

| Variant | When used |
|---|---|
| `MerchantRevoked` | Maintainer called `revoke_assignment` |
| `ContributorWithdrew` | Contributor called `withdraw_application` |
| `AdminOverride` | Admin intervention |
| `Other(String)` | Free-text fallback |

---

## Architecture

```
On-chain event (Stellar)
        │
        ▼
  Event Listener / Webhook
        │
        ▼
CancellationAuditService::record(...)
        │
        ▼
   AuditStore::insert(record)
        │
  ┌─────┴──────┐
  │  Postgres  │  (production)
  │  DynamoDB  │  (alternative)
  │  MemStore  │  (tests)
  └────────────┘
```

The `AuditStore` trait decouples the service from the storage backend, keeping all database details out of business logic and making the service fully testable in-process.

---

## API Surface

```rust
// Record a new cancellation
service.record(org_id, issue_id, contributor, cancelled_by, reason, tx_hash)
  -> Result<CancellationRecord, AuditError>

// Merchant queries
service.history_for_org(org_id)           -> Result<Vec<CancellationRecord>, AuditError>
service.history_for_contributor(address)  -> Result<Vec<CancellationRecord>, AuditError>
```

---

## Integration Points

The service should be called from the backend whenever any of these on-chain functions execute:

| On-chain function | Reason variant |
|---|---|
| `revoke_assignment` | `CancellationReason::MerchantRevoked` |
| `withdraw_application` | `CancellationReason::ContributorWithdrew` |

Hook into the existing Stellar event listener and call `service.record(...)` after parsing the relevant contract event.

---

## Production Notes

- **Idempotency**: use `tx_hash` as a deduplication key to avoid double-writes on event replay.
- **Retention**: retain records for at least 12 months to satisfy merchant audit requirements.
- **Access control**: expose `history_for_org` only to authenticated merchants of that org.

---

## Testing

Three unit tests cover the core behaviour (see `src/cancellation_audit.rs`):

| Test | What it checks |
|---|---|
| `record_stores_event` | A record is persisted with correct fields |
| `history_for_org_filters_correctly` | Queries return only records for the requested org |
| `history_for_contributor_filters_correctly` | Queries return only records for the requested contributor |
