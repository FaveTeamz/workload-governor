# Cancellation Audit API

## Overview
The cancellation audit API provides access to logs of all revoked and withdrawn applications. Each cancellation record captures the reason for the cancellation, enabling operators to distinguish between different cancellation scenarios.

## Cancellation Reason Codes

The following reason codes identify why a cancellation occurred:

| Code | Description |
|------|-------------|
| `CONTRIBUTOR_WITHDREW` | Contributor voluntarily withdrew their application |
| `MAINTAINER_REVOKED` | Maintainer/Operator revoked the subscription |
| `TTL_EXPIRED` | Subscription expired due to time-to-live timeout |
| `ADMIN_CANCELLED` | Admin cancelled the subscription |

## Endpoints

### GET /api/audit/cancellations

Get paginated cancellation audit records.

#### Headers
| Header | Description |
|--------|-------------|
| `Authorization` | Bearer token with `audit:read` scope |

#### Query Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `org_id` | string | Required (non-admin) | Organization ID |
| `page` | integer | No | Page number (default: 1) |
| `page_size` | integer | No | Records per page (default: 50, max: 200) |
| `start_date` | date | No | Filter by start date (ISO 8601) |
| `end_date` | date | No | Filter by end date (ISO 8601) |

#### Response Headers
| Header | Description |
|--------|-------------|
| `X-Total-Count` | Total number of records |
| `X-Page` | Current page number |
| `X-Page-Size` | Records per page |
| `X-Total-Pages` | Total number of pages |

#### Response Body
```json
{
  "success": true,
  "data": [
    {
      "event_type": "revoke",
      "actor": "GABC...",
      "contributor": "GDEF...",
      "org_id": "org-123",
      "issue_id": 456,
      "reason": "MAINTAINER_REVOKED",
      "timestamp": "2024-01-01T00:00:00.000Z",
      "tx_hash": "0x123..."
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "total": 100,
    "totalPages": 2
  }
}
{
  "success": true,
  "data": {
    "total": 25,
    "byEventType": {
      "revoke": 15,
      "withdraw": 10
    },
    "byActor": {
      "GABC...": 12,
      "GDEF...": 8,
      "GHIJ...": 5
    "byReason": {
      "MAINTAINER_REVOKED": 12,
      "CONTRIBUTOR_WITHDREW": 8,
      "TTL_EXPIRED": 3,
      "ADMIN_CANCELLED": 2
    }
  }
}
{
  "error": "Unauthorized",
  "message": "API key required with audit:read scope"
}
{
  "error": "Bad Request",
  "message": "org_id filter is required for non-admin users"
}
{
  "error": "Internal Server Error",
  "message": "Failed to fetch cancellation audit records"
}
curl -X GET \
  "https://api.workload-governor.com/api/audit/cancellations?org_id=org-123&page=1&page_size=50" \
  -H "Authorization: Bearer YOUR_TOKEN"
# Run audit tests
npm test -- audit.test.ts

# Run with coverage
npm test -- audit.test.ts --coverage
