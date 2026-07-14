# Create fiat on-ramp order

Creates an order to buy USDT using local fiat currency. The user makes the payment through the available method for their currency (PIX, QR Code, Webpay, SPEI, bank transfer, credit card) and receives USDT.

```
POST /api/v2/orders/onramp
```

**Authentication**: `X-API-Key`

## Prerequisite: get a quote

Before creating the order, obtain a quote from `/pricing/panel/buy`. The returned `quote_uuid` is valid for **5 minutes**.

## Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `quote_uuid` | UUID | Yes | UUID of the quote obtained from `/pricing/panel/buy` |
| `deposit_fields` | object | Conditional | Payer data, required by some currencies (e.g., CLP, MXN, EUR, USD, PEN). See `deposit_fields` in `/exchange-currencies` |
| `description` | string | No | Free-text description (max. 500 characters) |
| `pos_uuid` | UUID | No | Point of Sale terminal UUID (defaults to system POS if omitted) |
| `additional_infos` | array | No | Key-value pairs forwarded to the payment provider. **PIX only.** Each item: `{ "key": string, "value": string }` |

## Examples

```bash
# Basic order (BRL via PIX)
curl -X POST \
  'https://api.nauttfinance.com/api/v2/orders/onramp' \
  -H 'X-API-Key: ntt_your_key_here' \
  -H 'Content-Type: application/json' \
  -d '{
    "quote_uuid": "550e8400-e29b-41d4-a716-446655440000"
  }'

# Order with payer data (e.g., CLP via Webpay, MXN via SPEI, EUR/USD/PEN via bank transfer)
curl -X POST \
  'https://api.nauttfinance.com/api/v2/orders/onramp' \
  -H 'X-API-Key: ntt_your_key_here' \
  -H 'Content-Type: application/json' \
  -d '{
    "quote_uuid": "550e8400-e29b-41d4-a716-446655440000",
    "deposit_fields": {
      "first_name": "Gabriel",
      "last_name": "Santos",
      "email": "gabriel@example.com"
    }
  }'

# PIX order with additional_infos (custom metadata for the provider)
curl -X POST \
  'https://api.nauttfinance.com/api/v2/orders/onramp' \
  -H 'X-API-Key: ntt_your_key_here' \
  -H 'Content-Type: application/json' \
  -d '{
    "quote_uuid": "550e8400-e29b-41d4-a716-446655440000",
    "additional_infos": [
      { "key": "customer_id", "value": "12345" },
      { "key": "reference", "value": "ORDER-2025-001" }
    ]
  }'
```

## Response (201)

The response body matches the client view returned by `GET /api/v2/orders/{uuid}` — only the envelope `code` (`order.order_created`) and `message` differ. Orders expire **30 minutes** after creation (credit card orders expire in **24 hours**). For deposits, only `crypto_amount` is exposed (mutual exclusion with `crypto_full_amount`). The `payment_data` block varies by currency/payment method — see the per-provider variants below the canonical example.

**PIX (Brazil) — canonical:**
```json
{
  "message": "Order created successfully",
  "code": "order.order_created",
  "data": {
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "order_type": "deposit",
    "description": "PIX deposit for USDT purchase",
    "status": "finished",
    "fiat_amount": "1000.0000",
    "crypto_amount": "196.0784",
    "nautt_quote": "5.1000",
    "in_blockchain_hash": "0x1234567890abcdef1234567890abcdef12345678",
    "out_blockchain_hash": "0xabcdef1234567890abcdef1234567890abcdef12",
    "destination_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "expire_at": "2025-01-15T18:30:00+00:00",
    "payer": {
      "name": "Maria Santos",
      "document_type": "CPF",
      "document": "12345678900"
    },
    "payment_data": {
      "payment_method": "pix",
      "qrcode": "00020126580014br.gov.bcb.pix0136a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    },
    "user": {
      "uuid": "660e8400-e29b-41d4-a716-446655440001",
      "name": "Maria Santos",
      "email": "maria@example.com"
    },
    "currency": {
      "uuid": "770e8400-e29b-41d4-a716-446655440002",
      "name": "Brazilian Real",
      "symbol": "BRL",
      "prefix": "R$",
      "country": {
        "uuid": "aa0e8400-e29b-41d4-a716-446655440010",
        "name": "Brazil",
        "symbol1": "BR",
        "phone_code": "+55"
      }
    },
    "token": {
      "uuid": "880e8400-e29b-41d4-a716-446655440003",
      "name": "Tether USD",
      "symbol": "USDT",
      "decimals": 6
    },
    "network": {
      "uuid": "990e8400-e29b-41d4-a716-446655440004",
      "name": "Polygon",
      "chain_id": 137,
      "is_testnet": false
    },
    "created_at": "2025-01-10T14:23:45+00:00",
    "updated_at": "2025-01-10T15:45:30+00:00"
  }
}
```

**PIX — Brazil (`br-urban`, BTG Pactual):**
```json
{
  "data": {
    "payment_data": {
      "payment_method": "pix",
      "pix_qrcode": "00020126580014br.gov.bcb.pix0136a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "pix_qrcode_url": "https://qrcode.btgpactual.com/v1/abc123.png",
      "pix_provider": "btg",
      "pix_provider_id": "btg-collection-7f3a9c1e",
      "pix_expires_at": "2025-01-15T15:23:45+00:00",
      "pix_status": "ACTIVE"
    }
  }
}
```
> `pix_qrcode` is the copy-paste PIX code; `pix_qrcode_url` is the rendered QR image URL (BTG returns a link, not base64). Payment is confirmed via the BTG webhook.

**QR Code — ARS (Argentina, Transferencias 3.0):**
```json
{
  "data": {
    "payment_data": {
      "payment_method": "qr_code",
      "public_code": "ABC123",
      "qr_code": "00020101021226850014...",
      "payment_method_name": "Transferencias 3.0"
    }
  }
}
```

**Redirect — CLP (Chile, Webpay):**
```json
{
  "data": {
    "payment_data": {
      "payment_method": "webpay",
      "provider_url": "https://webpay3g.transbank.cl/...",
      "payment_method_name": "Webpay"
    }
  }
}
```
> Redirect the user to `provider_url` to complete the payment.

**Bank transfer — MXN (Mexico, SPEI):**
```json
{
  "data": {
    "payment_data": {
      "payment_method": "transferencia bancaria",
      "clabe": "710969000105505873",
      "payment_method_name": "Transferencia Bancaria"
    }
  }
}
```
> The user must make a SPEI transfer to the provided CLABE.

**Bank transfer — EUR/USD/PEN:**
```json
{
  "data": {
    "payment_data": {
      "payment_method": "bank_transfer",
      "bank_name": "HSBC Europe",
      "currency": "EUR",
      "bank_data": [
        { "field_name": "iban", "value": "DE89370400440532013000" },
        { "field_name": "swift", "value": "COBADEFFXXX" },
        { "field_name": "beneficiary_name", "value": "Nautt Finance EU" }
      ]
    }
  }
}
```

**Credit card (PagZen):**
```json
{
  "data": {
    "uuid": "ab1c2d3e-f4a5-6b7c-d8e9-012345678901",
    "status": "New",
    "step": "Bank",
    "expire_at": "2025-01-28T15:00:00Z",
    "payment_data": {
      "payment_method": "credit_card",
      "provider": "pagzen"
    }
  }
}
```
> No payment intent is created here. Proceed to `POST /api/v2/orders/credit-card/{uuid}/process-payment` with the card data to create the intent and initiate 3DS.

## Errors

**400 — Quote not found**
```json
{
  "message": "Quote not found",
  "code": "order.quote_not_found"
}
```

**400 — Quote expired**
```json
{
  "message": "Quote expired",
  "code": "order.quote_expired"
}
```

**400 — Exchange not configured**
```json
{
  "message": "Exchange not configured",
  "code": "order.exchange_not_configured"
}
```

**400 — Payment method not available**
```json
{
  "message": "Payment method not available",
  "code": "order.payment_method_not_available"
}
```

**400 — Deposit bank account not found** (EUR/USD/PEN when no active account is configured)
```json
{
  "message": "No active deposit bank account found",
  "code": "orders.deposit_bank_account_not_found"
}
```

**422 — Payer fields required**
```json
{
  "message": "Deposit fields are required for this currency",
  "code": "order.deposit_fields_required"
}
```

**422 — Invalid payer fields**
```json
{
  "message": "Deposit fields validation failed",
  "code": "order.deposit_fields_validation_failed"
}
```
