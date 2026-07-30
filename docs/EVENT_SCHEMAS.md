# Event Schemas

All contract events now carry a leading `version: u32` field in their data payload.
The current schema version is `1` for every event emitted by this contract.

## Versioned event payloads

| Event | Topics | Data payload |
| --- | --- | --- |
| `init` | `("init", admin)` | `(version, admin)` |
| `maint_reg` | `("maint_reg", admin)` | `(version, maintainer, org_id)` |
| `app_sub` | `("app_sub", contributor)` | `(version, contributor, org_id, issue_id)` |
| `app_wdw` | `("app_wdw", contributor)` | `(version, contributor, org_id, issue_id)` |
| `assigned` | `("assigned", maintainer)` | `(version, maintainer, contributor, org_id, issue_id)` |
| `completed` | `("completed", maintainer)` | `(version, maintainer, contributor, org_id, issue_id)` |
| `revoked` | `("revoked", maintainer)` | `(version, maintainer, contributor, org_id, issue_id)` |
| `cap_upd` | `("cap_upd", admin)` | `(version, old_cap, new_cap)` |

## Migration guide for off-chain consumers

Consumers that previously parsed unversioned event payloads should be updated as follows:

1. Read the first field of every event payload as `version`.
2. If `version == 1`, parse the remaining fields using the schema above.
3. If `version` is unknown, treat the event as unsupported, log a warning, and skip further parsing rather than assuming the old positional layout.
4. When new fields are introduced in a future schema version, keep the parser backward-compatible by checking the version before parsing the payload.

This keeps existing indexers forward-compatible while avoiding crashes when the contract evolves.
