# Get webhook

```
GET /api/v2/client-webhooks/{uuid}
```

**Authentication**: `X-API-Key`

Retrieves details of a specific webhook you own. The `secret` field is never returned by this endpoint.

## Path parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `uuid` | UUID | Yes | Webhook UUID |

## Example

```bash
curl -X GET \
  'https://api.nauttfinance.com/api/v2/client-webhooks/a1b2c3d4-e5f6-7890-abcd-ef1234567890' \
  -H 'X-API-Key: ntt_your_key_here'
```

## Response (200)

```json
{
  "code": "order.webhook_retrieved",
  "data": {
    "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "url": "https://myapp.com/webhooks/nautt",
    "event_types": ["order.completed", "order.paid"],
    "description": "Production order notifications",
    "is_active": true,
    "created_at": "2026-01-18T12:00:00Z",
    "updated_at": "2026-01-18T12:00:00Z"
  }
}
```

## Errors

**404 — Not found**
```json
{
  "message": "Webhook not found",
  "code": "order.webhook_not_found"
}
```
