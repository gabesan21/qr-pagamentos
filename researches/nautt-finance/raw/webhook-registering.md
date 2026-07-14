# Create Client Webhook

## Description

Registers a new webhook URL to receive order status notifications. The webhook secret is generated automatically and returned **only once** in the creation response.

## Endpoint

```
POST /api/v2/client-webhooks
```

## Authentication

Accepts **either** authentication method. The registered webhook is owned by, and scoped to, the authenticated caller.

- 🔑 **API Key** — send an `X-API-Key` header:

  ```
  X-API-Key: ntt_your_api_key
  ```

- 🔒 **JWT Bearer Token** — send an `Authorization` header (or the `nautt_at` cookie):

  ```
  Authorization: Bearer <jwt_token>
  ```

## Request Body

| Field         | Type     | Required | Description                                     |
| ------------- | -------- | -------- | ----------------------------------------------- |
| `url`         | string   | Yes      | HTTPS URL to receive webhook notifications      |
| `event_types` | string[] | No       | Event types to subscribe to. Empty = all events |
| `description` | string   | No       | Human-readable label for the webhook            |

### Event Types

Valid values: `order.created`, `order.paid`, `order.processing`, `order.completed`, `order.failed`, `order.expired`, `order.rejected`, `order.refunded`, `order.canceled`

### Request Example

```json
{
  "url": "https://myapp.com/webhooks/nautt",
  "event_types": ["order.completed", "order.paid"],
  "description": "Production order notifications"
}
```

### Subscribe to all events

```json
{
  "url": "https://myapp.com/webhooks/nautt"
}
```

## Success Response

### ✅ Created (201)

```json
{
  "success": true,
  "code": "order.webhook_created",
  "message": "Webhook created successfully",
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

⚠️ **Important**: The `secret` is returned in **plaintext only once**, here in the creation response. It is never returned again by the list or get endpoints and cannot be retrieved later. Store it securely at creation time; if lost, delete the webhook and create a new one.

## Error Responses

### 422 Unprocessable Entity

```json
{
  "success": false,
  "code": "order.validation_failed",
  "message": "Validation failed",
  "data": {
    "message": "URL must use HTTPS"
  }
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "code": "order.internal_error",
  "message": "An internal error occurred"
}
```

## Quick Example

```bash
# Register a webhook using an API key
curl -X POST \
  'https://stage.nauttfinance.com/api/v2/client-webhooks' \
  -H 'X-API-Key: ntt_your_api_key' \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://myapp.com/webhooks/nautt",
    "event_types": ["order.completed", "order.paid"],
    "description": "Production order notifications"
  }'

# Same request using a JWT session
curl -X POST \
  'https://stage.nauttfinance.com/api/v2/client-webhooks' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{ "url": "https://myapp.com/webhooks/nautt" }'
```

## Related Documentation

- **[Client Webhooks Overview](./index.md)** — Overview and security model
- **[List Webhooks](./list-webhooks.md)** — List registered webhooks
