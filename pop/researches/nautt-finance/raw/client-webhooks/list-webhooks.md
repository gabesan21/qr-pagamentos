# List webhooks

```
GET /api/v2/client-webhooks
```

**Authentication**: `X-API-Key`

Returns a paginated list of the webhooks registered by the authenticated caller. The `secret` field is never included here — it is only returned once, at creation.

## Query parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `page` | integer | No | Page number (default: 1, minimum: 1) |
| `limit` | integer | No | Items per page (default: 20, maximum: 100) |

## Example

```bash
curl -X GET \
  'https://api.nauttfinance.com/api/v2/client-webhooks?page=1&limit=10' \
  -H 'X-API-Key: ntt_your_key_here'
```

## Response (200)

```json
{
  "message": "Webhooks listed",
  "code": "order.webhooks_listed",
  "data": [
    {
      "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "url": "https://myapp.com/webhooks/nautt",
      "event_types": ["order.completed", "order.paid"],
      "description": "Production order notifications",
      "is_active": true,
      "created_at": "2026-01-18T12:00:00Z",
      "updated_at": "2026-01-18T12:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "total_pages": 1
  }
}
```

**Notes**:
- `description` is `null` when not set.

### Empty list (200)

```json
{
  "message": "No webhooks found",
  "code": "order.webhooks_empty",
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "total_pages": 0
  }
}
```
