# Client webhooks

Register a URL to receive real-time HTTP POST notifications when your orders change status. Notifications are signed with HMAC-SHA256 so you can verify they came from Nautt.

**Authentication**: `X-API-Key`

---

## Endpoints

- **[Register a webhook](./create-webhook.md)** — Register a new URL to receive order notifications.
- **[List webhooks](./list-webhooks.md)** — List your registered webhooks.
- **[Get webhook](./get-webhook.md)** — Retrieve details of a specific webhook.

> Updating or deleting a webhook requires a JWT session (available through the Nautt panel) and is not available via API Key.

---

## Event types

Subscribe to specific event types, or omit `event_types` (or send an empty array) to receive all events.

| Event type | Trigger |
|------------|---------|
| `order.created` | Order created |
| `order.paid` | Payment confirmed |
| `order.processing` | Order started processing |
| `order.completed` | Order finalized (USDT sent or fiat transferred) |
| `order.failed` | Reserved for future use — not currently emitted |
| `order.expired` | Order expired without payment |
| `order.rejected` | Order rejected |
| `order.refunded` | Refund completed |
| `order.canceled` | Order canceled |

---

## Notification payload

Each webhook call is an HTTP POST with this body:

```json
{
  "id": "d4e5f6a7-b8c9-0123-4567-89abcdef0123",
  "event": "order.completed",
  "created_at": "2026-01-18T12:00:00Z",
  "data": {
    "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "status": "finished",
    "payment_link_uuid": "ee0e8400-e29b-41d4-a716-446655440009"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Unique notification identifier. It stays the same on automatic retries and on manual resends from the panel, so use it for idempotency. It is **not** the same value as the `X-Nautt-Delivery` header |
| `event` | string | Event type that triggered the notification |
| `created_at` | string (ISO 8601) | Timestamp of the event |
| `data.uuid` | string (UUID) | Order UUID |
| `data.status` | string | New order status |
| `data.payment_link_uuid` | string (UUID) | Payment link that originated the order. **The key is omitted entirely** when the order was not created through a payment link — it is never sent as `null`, so branch on key presence rather than on value |
| `data.display_amount` / `data.display_currency` | string | Only on `order.completed` for a card order paid out in two parts: the amount of that part (decimal string) and its currency. Omitted otherwise |

---

## Verifying the signature

Every notification includes these headers:

| Header | Description |
|--------|-------------|
| `X-Nautt-Signature` | `sha256=<hex>` — lowercase hex HMAC-SHA256 of the raw request body. The key is the **full** webhook secret, including the `nautt_whsec_` prefix |
| `X-Nautt-Delivery` | Delivery attempt record UUID. It stays the same on automatic retries, but a manual resend from the panel creates a new one. It does not match the body `id` |
| `X-Nautt-Event` | Event type that triggered the notification (same as the body `event`) |

The signature has no timestamp, so there is no built-in replay protection: deduplicate by the body `id`.

```python
import hmac, hashlib

def verify_signature(raw_body: bytes, secret: str, received_signature: str) -> bool:
    expected = hmac.new(
        secret.encode("utf-8"),  # full secret, e.g. "nautt_whsec_..."
        raw_body,                # bytes exactly as received, before any JSON parsing
        hashlib.sha256,
    ).hexdigest()

    received_hex = received_signature.removeprefix("sha256=")
    return hmac.compare_digest(expected, received_hex)
```

Sign the raw bytes exactly as received (e.g. Flask `request.get_data()`) — re-serializing the parsed JSON produces a different digest.

---

## The webhook secret

- Generated automatically when you register a webhook.
- Returned in **plaintext only once**, in the [Register a webhook](./create-webhook.md) response.
- Format: `nautt_whsec_<43 base64url characters>` (32 random bytes, no padding). Use the whole string, prefix included, as the HMAC key.
- Never returned again by any other endpoint — if you lose it, register a new webhook.

---

## URL requirements

- Must use **HTTPS** — plain HTTP URLs are rejected.
- Must be publicly reachable from Nautt's servers.
- Respond quickly and process the notification asynchronously.
