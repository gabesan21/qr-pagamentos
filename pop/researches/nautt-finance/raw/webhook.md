Webhooks ​

Webhooks allow your system to receive real-time notifications when order status changes occur — no polling required.
How it works

    Register a webhook on our site or app under API Keys → Webhooks — provide a URL and the event types you want to receive
    Nautt sends an HTTP POST to your URL whenever a matching event fires
    Your server must respond with HTTP 2xx within 15 seconds — any other response is treated as a failure
    Automatic retries — failed deliveries are retried up to 5 times with exponential backoff

Delivery payload

Every webhook POST sends the same JSON envelope:

{
"id": "<delivery-uuid>",
"event": "order.completed",
"created_at": "2025-01-10T15:45:30+00:00",
"data": {
"uuid": "<order-uuid>",
"status": "finished",
"webhook_deliveries": [
{
"uuid": "wd0e8400-e29b-41d4-a716-446655440001",
"webhook_uuid": "wh0e8400-e29b-41d4-a716-446655440001",
"order_uuid": "550e8400-e29b-41d4-a716-446655440000",
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

After receiving the event, call GET /api/v2/orders/{uuid} to fetch the full order details.
Event types
Event Triggered when
order.created Order created (status: new)
order.paid Payment confirmed (status: paid)
order.processing Order being processed (status: processing)
order.completed Order completed successfully (status: finished)
order.rejected Order rejected (status: rejected)
order.canceled Order canceled (status: canceled)
order.refunded Order refunded (status: refunded)
order.expired Order expired before payment (status: expired)
Order statuses
Status Description
new Order created, awaiting payment
processing Payment received, being processed
paid Payment confirmed
finished Order completed successfully
rejected Order rejected
canceled Order canceled
refunded Order refunded
expired Order expired before payment
Retry policy
Attempt Delay after failure
1st retry 10 seconds
2nd retry 20 seconds
3rd retry 40 seconds
4th retry 80 seconds (~1 min)
5th retry 160 seconds (~3 min)

After 5 failed attempts the delivery is marked is_permanently_failed: true. You can check delivery history via GET /api/v2/webhook-deliveries?order_uuid={uuid} or retrieve a specific delivery with GET /api/v2/webhook-deliveries/{uuid}.
