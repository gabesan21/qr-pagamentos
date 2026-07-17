# Webhooks

Webhooks allow a client system to receive real-time notifications when order status changes occur.

## Delivery

Register a webhook under API Keys → Webhooks with a URL and the desired event types. Nautt sends an HTTP POST for every matching event. The receiver must return an HTTP `2xx` response within 15 seconds; every other response is a failure. Failed deliveries are retried up to five times with exponential backoff.

```json
{
  "id": "<delivery-uuid>",
  "event": "order.completed",
  "created_at": "2025-01-10T15:45:30+00:00",
  "data": {
    "uuid": "<order-uuid>",
    "status": "finished",
    "webhook_deliveries": [
      {
        "uuid": "<webhook-delivery-uuid>",
        "webhook_uuid": "<webhook-uuid>",
        "order_uuid": "<order-uuid>",
        "event_type": "order.completed",
        "is_delivered": true,
        "is_permanently_failed": false,
        "attempt_number": 1,
        "response_status": 200,
        "delivered_at": "2025-01-10T15:45:32Z",
        "created_at": "2025-01-10T15:45:30Z"
      }
    ]
  }
}
```

After receiving an event, call `GET /api/v2/orders/{uuid}` for the full authoritative order details.

## Events and statuses

| Event | Order status |
| --- | --- |
| `order.created` | `new` |
| `order.paid` | `paid` |
| `order.processing` | `processing` |
| `order.completed` | `finished` |
| `order.rejected` | `rejected` |
| `order.canceled` | `canceled` |
| `order.refunded` | `refunded` |
| `order.expired` | `expired` |

The documented order statuses are `new`, `processing`, `paid`, `finished`, `rejected`, `canceled`, `refunded`, and `expired`.

## Retry and recovery

Retries occur after 10, 20, 40, 80, and 160 seconds. After five failed attempts a delivery is marked permanently failed. Delivery history is available through `GET /api/v2/webhook-deliveries?order_uuid={uuid}` and `GET /api/v2/webhook-deliveries/{uuid}`.
