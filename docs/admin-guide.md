# Workload Governor Admin Guide

## Overview

The Workload Governor contract manages issue assignments and applications for contributors. This guide covers administration tasks including TTL (Time-To-Live) management, admin modes, and error handling.

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