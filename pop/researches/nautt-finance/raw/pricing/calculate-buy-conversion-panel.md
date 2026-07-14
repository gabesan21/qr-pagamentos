# Calculate USDT purchase with fiat

```
POST /api/v2/pricing/panel/buy
```

**Authentication**: `X-API-Key`

## Body parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `currency_uuid` | UUID | Yes | Fiat currency UUID |
| `exchange_currency_uuid` | UUID | Yes | Payment method UUID (obtained from `/exchange-currencies`) |
| `amount` | decimal | * | Fiat amount to send |
| `amount_usd` | decimal | * | Desired USDT amount (for reverse calculation) |

*Send only one of the two — never both at the same time.

## Examples

```bash
# Calculate how much USDT you receive by sending 500 BRL
curl -X POST \
  'https://api.nauttfinance.com/api/v2/pricing/panel/buy' \
  -H 'X-API-Key: ntt_your_key_here' \
  -H 'Content-Type: application/json' \
  -d '{
    "currency_uuid": "550e8400-e29b-41d4-a716-446655440000",
    "exchange_currency_uuid": "770e8400-e29b-41d4-a716-446655440002",
    "amount": "500.00"
  }'

# Calculate how much BRL you need to send to receive 20 USDT
curl -X POST \
  'https://api.nauttfinance.com/api/v2/pricing/panel/buy' \
  -H 'X-API-Key: ntt_your_key_here' \
  -H 'Content-Type: application/json' \
  -d '{
    "currency_uuid": "550e8400-e29b-41d4-a716-446655440000",
    "exchange_currency_uuid": "770e8400-e29b-41d4-a716-446655440002",
    "amount_usd": "20.00"
  }'
```

## Response (200)

```json
{
  "message": "Buy conversion calculated successfully",
  "code": "system.buy_conversion_calculated",
  "data": {
    "amount": "500.00",
    "final_amount": "97.50",
    "client_amount": "95.00",
    "profit": "1.46",
    "exchange_fee": "1.00",
    "min_withdrawal": "50.00",
    "withdrawal_delay_minutes": 30,
    "base_price": "5.00",
    "price": "5.205",
    "quote_uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

> The `quote_uuid` is valid for 5 minutes and must be used when creating the order.

## Errors

**400 — Invalid parameters**
```json
{
  "message": "Invalid parameters",
  "code": "validation.invalid_parameters"
}
```

**400 — Payment method invalid for this operation**
```json
{
  "message": "Exchange currency not valid for this operation",
  "code": "validation.exchange_currency_invalid"
}
```

**404 — Currency not found**
```json
{
  "message": "Currency not found",
  "code": "validation.currency_not_found"
}
```

**404 — Payment method not found**
```json
{
  "message": "Exchange currency mapping not found",
  "code": "validation.exchange_currency_not_found"
}
```

**422 — Invalid UUID format**
```json
{
  "message": "Validation errors occurred",
  "code": "validation.failed",
  "errors": {
    "currency_uuid": ["Invalid UUID format"]
  }
}
```
