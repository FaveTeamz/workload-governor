# WorkloadGovernor Event Schemas

## Event Types

### 1. Apply Event
```json
{
  "action": "apply",
  "contributor": "G...",
  "org_id": "org-123",
  "issue_id": 456
}{
  "action": "withdraw",
  "contributor": "G...",
  "org_id": "org-123",
  "issue_id": 456
}{
  "action": "assign",
  "contributor": "G...",
  "maintainer": "G...",
  "org_id": "org-123",
  "issue_id": 456
}{
  "action": "complete",
  "contributor": "G...",
  "maintainer": "G...",
  "org_id": "org-123",
  "issue_id": 456
}
{
  "action": "revoke",
  "contributor": "G...",
  "maintainer": "G...",
  "org_id": "org-123",
  "issue_id": 456
}
{
  "action": "register_maintainer",
  "maintainer": "G...",
  "org_id": "org-123"
}
cargo test -- --nocapture
