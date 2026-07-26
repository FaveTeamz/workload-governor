# Integration Guide

This guide provides step-by-step instructions for integrating the WorkloadGovernor smart contract into your application.

## Prerequisites

- Node.js 16+ or TypeScript environment
- Stellar SDK (js-stellar-sdk)
- Access to a Soroban-enabled Stellar RPC endpoint
- Contract address and contract code ID

## Installation

### 1. Get the Contract ABI

Retrieve the contract specification from the deployed WASM:

```bash
soroban contract inspect --wasm <path-to-workload-governor.wasm>
```

### 2. Install Stellar SDK

```bash
npm install @stellar/js-stellar-sdk @stellar/js-stellar-base
```

### 3. Initialize Contract Client

```typescript
import { ContractSpec, Address } from "@stellar/js-stellar-sdk";

const contractId = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
const spec = ContractSpec.fromJSON(contractABI);
```

## Common Operations

### Initialize Contract (Admin Only)

```typescript
const admin = Address.fromString("GXXXXX...");

const tx = await client.call({
    method: "initialize",
    args: [admin],
    signers: [admin]
});
```

### Register a Maintainer

```typescript
const admin = Address.fromString("GXXXXX...");
const maintainer = Address.fromString("GYYYYY...");
const orgId = new Symbol("my-org");

const tx = await client.call({
    method: "register_maintainer",
    args: [admin, maintainer, orgId],
    signers: [admin]
});
```

### Submit an Application

```typescript
const contributor = Address.fromString("GZZZZZ...");
const orgId = new Symbol("my-org");
const issueId = 42;

// First, check if contributor can apply (not at global limit)
const capacity = await client.call({
    method: "get_global_application_capacity",
    args: [contributor]
});

if (capacity > 0) {
    const tx = await client.call({
        method: "apply_for_issue",
        args: [contributor, orgId, issueId],
        signers: [contributor]
    });
}
```

### Assign Issue to Contributor

```typescript
const maintainer = Address.fromString("GXXXXX...");
const contributor = Address.fromString("GZZZZZ...");
const orgId = new Symbol("my-org");
const issueId = 42;

// Check if contributor can be assigned in this org
const capacity = await client.call({
    method: "get_org_assignment_capacity",
    args: [contributor, orgId]
});

if (capacity > 0) {
    const tx = await client.call({
        method: "assign_issue",
        args: [maintainer, contributor, orgId, issueId],
        signers: [maintainer]
    });
}
```

### Check Assignment Status

```typescript
const isAssigned = await client.call({
    method: "is_assigned",
    args: [contributor, orgId, issueId]
});

const count = await client.call({
    method: "get_org_assignment_count",
    args: [contributor, orgId]
});

console.log(`Assigned: ${isAssigned}, Count: ${count}/4`);
```

## Error Handling

All contract errors return as panics with specific error codes:

| Code | Meaning | Recovery |
|------|---------|----------|
| 1 | Already initialized | None - idempotent |
| 2 | Not initialized | Call initialize first |
| 3 | Unauthorized admin | Use correct admin key |
| 4 | Unauthorized maintainer | Register maintainer first |
| 5 | Unauthorized contributor | Auth with contributor key |
| 6 | Global app limit reached | Withdraw application first |
| 7 | Org assignment limit reached | Complete assignment first |
| 8 | Duplicate application | Application already pending |
| 9 | Application not found | Check application status |
| 10 | Assignment not found | Check assignment status |
| 11 | Already assigned | Issue already has assignee |

### Error Handling Example

```typescript
try {
    await client.call({
        method: "apply_for_issue",
        args: [contributor, orgId, issueId],
        signers: [contributor]
    });
} catch (error) {
    if (error.code === 6) {
        console.error("Global application limit reached");
        // Suggest withdrawing an old application
    } else if (error.code === 8) {
        console.error("Already applied to this issue");
    }
}
```

## Querying State

### Get Global Application Count

```typescript
const count = await client.call({
    method: "get_global_application_count",
    args: [contributor]
});
console.log(`Pending applications: ${count}/15`);
```

### Get Org Assignment Count

```typescript
const count = await client.call({
    method: "get_org_assignment_count",
    args: [contributor, orgId]
});
console.log(`Active assignments: ${count}/4`);
```

### Check If Applied

```typescript
const hasApplied = await client.call({
    method: "has_applied",
    args: [contributor, orgId, issueId]
});
```

### Check Available Capacity

```typescript
const orgCapacity = await client.call({
    method: "get_org_assignment_capacity",
    args: [contributor, orgId]
});

const globalCapacity = await client.call({
    method: "get_global_application_capacity",
    args: [contributor]
});

console.log(`Available slots: ${orgCapacity} in org, ${globalCapacity} globally`);
```

## UI Integration Examples

### Organization Selector Dropdown

```typescript
async function buildOrgSelector(contributor: Address) {
    const orgs = await fetchUserOrgs(contributor); // From your backend
    
    const options = await Promise.all(orgs.map(async (org) => {
        const count = await client.call({
            method: "get_org_assignment_count",
            args: [contributor, org.id]
        });
        
        return {
            label: `${org.name} (${count}/4)`,
            value: org.id,
            disabled: count >= 4
        };
    }));
    
    return options;
}
```

### Application Status Display

```typescript
async function getApplicationStatus(
    contributor: Address,
    orgId: Symbol,
    issueId: number
) {
    const [hasApplied, isAssigned] = await Promise.all([
        client.call({
            method: "has_applied",
            args: [contributor, orgId, issueId]
        }),
        client.call({
            method: "is_assigned",
            args: [contributor, orgId, issueId]
        })
    ]);
    
    if (isAssigned) return "assigned";
    if (hasApplied) return "pending";
    return "available";
}
```

## Best Practices

### 1. Always Check Capacity Before Actions

```typescript
// ✅ Good: Check first
const capacity = await client.call({
    method: "get_global_application_capacity",
    args: [contributor]
});

if (capacity > 0) {
    // Apply
}

// ❌ Bad: Try and fail
try {
    await client.call({
        method: "apply_for_issue",
        args: [contributor, orgId, issueId],
        signers: [contributor]
    });
} catch (e) {
    // Handle limit reached
}
```

### 2. Extend TTL Before Expiry

Applications expire after contract's TTL window. Extend them proactively:

```typescript
// Call periodically (e.g., weekly)
await client.call({
    method: "extend_application_ttl",
    args: [contributor, orgId, issueId]
});
```

### 3. Batch Query Operations

```typescript
// ✅ Good: Parallel queries
const [globalCount, orgCount, capacity] = await Promise.all([
    client.call({ method: "get_global_application_count", args: [contributor] }),
    client.call({ method: "get_org_assignment_count", args: [contributor, orgId] }),
    client.call({ method: "get_org_assignment_capacity", args: [contributor, orgId] })
]);

// ❌ Bad: Sequential queries
const globalCount = await client.call({ ... });
const orgCount = await client.call({ ... });
const capacity = await client.call({ ... });
```

### 4. Handle Expiry Gracefully

```typescript
try {
    await client.call({
        method: "extend_application_ttl",
        args: [contributor, orgId, issueId]
    });
} catch (error) {
    if (error.code === 9) {
        // Application expired - remove from UI
        updateApplicationList();
    }
}
```

## Testing

### Unit Testing Example

```typescript
import { testutils } from "@stellar/js-stellar-sdk";

describe("WorkloadGovernor Integration", () => {
    let client: ContractClient;
    let admin: Keypair;
    let contributor: Keypair;
    
    beforeAll(() => {
        admin = Keypair.random();
        contributor = Keypair.random();
    });
    
    it("should allow contributor to apply for issue", async () => {
        await client.call({
            method: "initialize",
            args: [admin],
            signers: [admin]
        });
        
        const tx = await client.call({
            method: "apply_for_issue",
            args: [contributor, "org-1", 1],
            signers: [contributor]
        });
        
        expect(tx.success).toBe(true);
    });
});
```

## Troubleshooting

### Common Issues

**Issue**: "Not initialized" error
- **Cause**: Contract not initialized yet
- **Solution**: Call `initialize()` with admin key

**Issue**: "Unauthorized maintainer" error
- **Cause**: Maintainer not registered for org
- **Solution**: Register maintainer with admin key

**Issue**: "Global application limit reached"
- **Cause**: Contributor already has 15 pending applications
- **Solution**: Withdraw some applications or wait for completion

**Issue**: Application disappeared
- **Cause**: TTL expired (contract housekeeping)
- **Solution**: Call `extend_application_ttl()` periodically

## Support

For issues or questions:
1. Check the error codes table above
2. Review contract documentation in README.md
3. Check the test suite for examples
4. Open an issue on GitHub

