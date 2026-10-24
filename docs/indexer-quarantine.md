# Indexer event validation and quarantine

Before inserting into `contract_events`, the indexer validates the exact XDR
types and tuple lengths emitted by `src/events.rs`. The runtime schema is in
`src/contractEventSchema.ts`; update it alongside contract event ABI changes.
Validation accepts SDK v12 `ScVal` objects, raw RPC base64, and legacy `{ xdr }`
wrappers. SDK `ledgerClosedAt` and legacy `createdAt` timestamps are supported.

Every event must have three topics: `(Symbol("WG"), Symbol(event_name), Address)`.
Data must be an XDR vector with exactly the following fields:

| Event | Data tuple |
| --- | --- |
| `applied`, `withdrew` | `(org_id: Symbol, issue_id: u32)` |
| `assigned`, `completed`, `revoked` | `(maintainer: Address, org_id: Symbol, issue_id: u32)` |
| `maint_reg`, `maint_dreg` | `(admin: Address, org_id: Symbol)` |
| `init` | `(admin: Address, ledger_seq: u32)` |
| `mig_done` | `(entries_migrated: u32,)` |
| `ms_set` | `(threshold: u32, signer_count: u32)` |
| `cap_prop`, `cap_exec` | `(proposal_id: u32, new_global_cap: u32)` |
| `cap_vote` | `(proposal_id: u32, approve: bool)` |
| `adm_act` | `(nonce: u32,)` |

The indexer projects `applied`, `withdrew`, `assigned`, `completed`, `revoked`,
and `maint_reg` into `contract_events`. Other valid ABI events are skipped.
Unknown event names, invalid topics or data, and invalid database record
metadata are quarantined with their serialized RPC payload and validation reason.
Quarantined events do not produce live notifications.

Apply migration `4_indexer_quarantine.js` before deploying to an existing database.
It creates `indexer_quarantine` and widens `contract_events.issue_id` to `BIGINT`
to support the full on-chain `u32` range. Rolling back the migration requires all
stored issue IDs to fit PostgreSQL `INTEGER`. The database bootstrap also creates
the quarantine table for new installations.

Inspect rejected events with:

```sql
SELECT contract_id, event_id, reason, raw_event, created_at
FROM indexer_quarantine
ORDER BY created_at DESC
LIMIT 100;
```

The `(contract_id, event_id)` unique constraint prevents duplicate quarantine rows
on replay. Events with a missing ID retain a nullable `event_id` so their malformed
metadata cannot prevent inspection. A failed quarantine write propagates to the
polling retry loop, keeping the batch cursor unchanged. After a successful
quarantine write, indexing continues with the next event in the batch.
