# Organization Selector Component

This module provides utilities for organization selection and filtering in the Workload Governor contract.

## Features

- **Organization Filtering**: Search organizations by name or ID
- **Assignment Tracking**: Display per-org assignment counts (X/4)
- **Session Persistence**: Selection state managed across contract calls
- **Searchability**: Fast lookups by org name or org ID

## Usage

### Query Organization Assignment Count

```rust
let count = workload_governor::get_org_assignment_count(&env, contributor, org_id);
```

### List All Organizations for a Contributor

Organizations are managed through the contract's state. Query available organizations and their assignment counts.

### Filter Organizations by Name or ID

Use the provided utility functions to filter organizations:

```rust
// Get organization by ID
let org = get_organization_by_id(&env, org_id);

// Search organizations by partial name match
let matching_orgs = search_organizations(&env, search_term);
```

## Component Behavior

1. **Renders**: All orgs available for the connected contributor
2. **Searchable**: Filter orgs by name or ID in real-time
3. **Display**: Shows assignment count in format "X/4" next to each org
4. **Persistent**: Selection is maintained in contract state across calls
5. **Performance**: Optimized for fast lookups and filtering

## API Reference

### `get_org_assignment_count(env, contributor, org_id) -> u32`
Returns the number of active assignments for a contributor in a specific organization.

### `get_global_application_count(env, contributor) -> u32`
Returns the total number of pending applications across all organizations.

### `get_organization_by_id(env, org_id) -> Organization`
Retrieves organization details by ID.

## Integration with Contract

The organization selector integrates with:
- Application limits (6 global cap)
- Assignment limits (4 per-org cap)
- Maintainer registration per organization
- Issue assignment tracking

See the main contract documentation for complete details.
