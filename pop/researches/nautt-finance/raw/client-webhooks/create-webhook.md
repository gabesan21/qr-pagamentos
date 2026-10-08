# Register a webhook

Registers a new URL to receive order status notifications.

```
POST /api/v2/client-webhooks
```

**Authentication**: `X-API-Key`

## Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | HTTPS URL that will receive webhook notifications |
| `event_types` | string[] | No | Event types to subscribe to. Omit or send an empty array to receive all events |
| `description` | string | No | Human-readable label for the webhook |

Valid `event_types` values: `order.created`, `order.paid`, `order.processing`, `order.completed`, `order.failed`, `order.expired`, `order.rejected`, `order.refunded`, `order.canceled`.

## Example

```bash
curl -X POST \
  'https://api.nauttfinance.com/api/v2/client-webhooks' \
  -H 'X-API-Key: ntt_your_key_here' \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://myapp.com/webhooks/nautt",
    "event_types": ["order.completed", "order.paid"],
    "description": "Production order notifications"
  }'
```

## Response (201)

```json
{
  "message": "Webhook created successfully",
  "code": "order.webhook_created",
  "data": {
    "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "url": "https://myapp.com/webhooks/nautt",
    "secret": "nautt_whsec_dGhpcyBpcyBhIHRlc3Qgc2VjcmV0IGtleQ",
    "event_types": ["order.completed", "order.paid"],
    "description": "Production order notifications",
    "is_active": true,
    "created_at": "2026-01-18T12:00:00Z"
  }
}
```

**Notes**:
- The `secret` field is returned in plaintext **only here, only once**. It is never included in list or get responses and cannot be retrieved later — store it securely.
- See [Client webhooks — Verifying the signature](./index.md#verifying-the-signature) for how to use the secret.

## Errors

**422 — Validation failed**
```json
{
  "message": "Validation failed",
  "code": "order.validation_failed",
  "errors": {
    "message": "URL must use HTTPS"
  }
}
```

**500 — Internal error**
```json
{
  "message": "An internal error occurred",
  "code": "order.internal_error"
}
```
