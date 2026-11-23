# Indexer Quarantine Runbook

The event indexer validates supported contract events against the decoded
Soroban ABI before persisting them. Events that fail validation are logged and
stored in `indexer_quarantine`; ingestion then continues with the remaining
events in the batch.

## Inspect quarantined events

List the newest quarantined entries and their diagnostics:

```sql
SELECT id, ledger_seq, tx_hash, event_index, event_type, error_message, created_at
FROM indexer_quarantine
ORDER BY created_at DESC
LIMIT 100;
```

Inspect the raw topic and data XDR for a specific entry:

```sql
SELECT ledger_seq, tx_hash, event_type, raw_xdr, error_message
FROM indexer_quarantine
WHERE id = <quarantine_id>;
```

`raw_xdr` is a JSON object with the base64 XDR topic values and event data.
Decode those values with the Stellar SDK and compare their types, tuple lengths,
topic actor, and ordering with [`docs/event-schema.md`](./event-schema.md) and
the current contract ABI.

## Respond to a schema mismatch

1. Confirm the event's ledger and transaction on a trusted Stellar RPC or
   explorer.
2. Determine whether the payload is malformed or represents an intentional
   contract upgrade.
3. If the ABI changed intentionally, update the Zod event schemas and parser
   together, add coverage for the new shape, and deploy the migration if the
   quarantine table has not yet been provisioned.
4. Do not delete a quarantine entry until the event has been investigated.
   Quarantine entries are diagnostic records; the indexer does not retry them
   independently.

Quarantine logging includes the ledger and transaction hash. If a valid event
schema is rejected, retain its XDR and update the schema rather than editing
the stored payload.
