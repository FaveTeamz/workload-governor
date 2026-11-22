# Workload Governor Admin Guide

## Overview

The Workload Governor contract manages issue assignments and applications for contributors. This guide covers administration tasks including TTL (Time-To-Live) management, admin modes, and error handling.

---

## Admin Transfer

Admin authority moves between addresses in two steps, each signed by a different key:

1. The current admin calls `propose_admin(current_admin, new_admin)`. The nominated address is stored under `"p_admin"`, and the current admin keeps full authority.
2. The nominated address calls `accept_admin(new_admin)`. The stored admin is replaced and the pending entry is cleared in the same invocation.

If step 2 never happens, nothing changes: the current admin stays active. To correct a wrong nomination, call `propose_admin` again with the right address.

- Step-by-step procedure: [Admin key rotation runbook](runbooks/admin-key-rotation.md)
- Design rationale and alternatives considered: [ADR-006: Two-Step Admin Transfer](adr/ADR-006-two-step-admin-transfer.md)

---

## TTL Management

### What is TTL?

TTL (Time-To-Live) is the duration that a storage entry remains valid on the Stellar ledger. After the TTL expires, entries may be archived and become inaccessible.

### Why Extend TTL?

- Long-running assignments can span months
- Prevent archival of active assignments
- Ensure data availability for audits

### TTL Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `ASSIGNMENT_TTL` | 30 days | Default TTL for assignments |
| `EXTENDED_ASSIGNMENT_TTL` | 90 days | Extended TTL when manually extended |

### Functions

#### extend_assignment_ttl

Extends the TTL of an assignment entry and related counters.

**Function Signature:**