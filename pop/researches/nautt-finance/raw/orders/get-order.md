# Get order

```
GET /api/v2/orders/{uuid}
```

**Authentication**: `X-API-Key`

**Path parameters**:
- `uuid` (required): Order UUID

You can only retrieve orders you own. The response omits any field that has no value (they are not returned as `null`).

## Example

```bash
curl -X GET \
  'https://api.nauttfinance.com/api/v2/orders/550e8400-e29b-41d4-a716-446655440000' \
  -H 'X-API-Key: ntt_your_key_here'
```

## Order kinds

The four order kinds are derived from `order_type` and whether `fiat_amount` is greater than zero:

| Kind | `order_type` | `fiat_amount` | Key fields present |
|------|--------------|---------------|--------------------|
| Onramp | `deposit` | `> 0` | `currency`, `payer`, `payment_data` |
| Offramp | `withdrawal` | `> 0` | `currency`, `withdrawal_account` |
| Crypto deposit | `deposit` | `"0.0000"` | no `currency`; `payment_data.deposit_address`. Cross-token sub-variant adds `input_token` / `input_network` / `input_token_amount` |
| Crypto withdrawal | `withdrawal` | `"0.0000"` | no `currency`; `withdrawal_wallet`, `payment_data.source_address`. Cross-token sub-variant adds `output_token` / `output_network` / `output_token_amount` |

## Crypto amount visibility

The response always contains exactly one of these two fields, chosen by `order_type`:

| `order_type` | Field present | Meaning |
|--------------|---------------|---------|
| `deposit` | `crypto_amount` | Net crypto credited to the user after the Nautt fee |
| `withdrawal` | `crypto_full_amount` | Gross crypto debited from the user before the Nautt fee |

The other key is omitted entirely. Branch on `order_type` to know which one to read.

`payer` is also conditionally present: returned on deposits when available, NEVER returned on withdrawals.

## Payment flag

| Field | Type | Description |
|-------|------|-------------|
| `payment` | boolean | Whether the order is a direct PIX copia-e-cola payment. Always present; `true` only for direct PIX copia-e-cola payment orders, `false` otherwise. |

## Response (200)

The response wrapper is the same in every case:

```json
{
  "message": "Order retrieved successfully",
  "code": "order.retrieved",
  "data": { /* order object — see per-kind examples below */ }
}
```

### Onramp — fiat to USDT (BRL via PIX)

```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "order_type": "deposit",
  "description": "PIX deposit for USDT purchase",
  "status": "finished",
  "payment": false,
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
```

`destination_address` here is the user's receiving wallet. If a payment receipt has been uploaded, an additional `receipt_data` object will be present (`{ s3_key, file_name, file_size, content_type, uploaded_at }`).

### Offramp — USDT to fiat (BRL via PIX)

```json
{
  "uuid": "ff0e8400-e29b-41d4-a716-446655440010",
  "order_type": "withdrawal",
  "description": "Withdrawal via PIX",
  "status": "finished",
  "payment": false,
  "fiat_amount": "2500.0000",
  "crypto_full_amount": "490.1961",
  "nautt_quote": "5.1500",
  "destination_address": "0x9F8e7d6c5b4a39281706f5e4d3c2b1a098765432",
  "expire_at": "2025-01-12T16:00:00+00:00",
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
  "withdrawal_account": {
    "uuid": "cc0e8400-e29b-41d4-a716-446655440007",
    "account_label": "My PIX Account",
    "description": "Personal PIX account",
    "favorite": true,
    "pix_key": "maria@example.com",
    "pix_type": "email",
    "name": "Maria Santos",
    "document": "12345678901",
    "document_type": "CPF"
  },
  "created_at": "2025-01-11T14:30:00+00:00",
  "updated_at": "2025-01-11T15:45:00+00:00"
}
```

`payer` is never returned on offramp orders. `destination_address` here is the on-chain payments contract that receives the USDT before it is converted to fiat — not your bank account. The `withdrawal_account` object carries the destination bank data, with method-specific fields (`pix_key`, `bank_code`, `iban`, etc.) flattened at the root.

For PIX accounts, `withdrawal_account` also carries the holder data resolved against the Trace Finance DICT at registration time. Authenticated callers receive these fields raw:

- `name` — holder legal name as returned by the Trace DICT.
- `document` — CPF (11 digits) or CNPJ (14 digits), digits only.
- `document_type` — `"CPF"` or `"CNPJ"`.

The same data is exposed **masked** on the public endpoint (`GET /orders/public/{uuid}`) via the top-level `pix_holder_name`, `pix_holder_document` and `pix_holder_document_type` fields.

### Crypto deposit — BTC to USDT (cross-token)

```json
{
  "uuid": "110e8400-e29b-41d4-a716-446655440011",
  "order_type": "deposit",
  "description": "BTC to USDT conversion",
  "status": "finished",
  "payment": false,
  "fiat_amount": "0.0000",
  "crypto_amount": "4315.0000",
  "nautt_quote": "43150.0000",
  "in_blockchain_hash": "0000000000000000000234567890abcdef1234567890abcdef1234567890abcd",
  "out_blockchain_hash": "0xfedcba0987654321fedcba0987654321fedcba09",
  "destination_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "expire_at": "2025-01-13T20:00:00+00:00",
  "payment_data": {
    "payment_method": "crypto",
    "deposit_address": "bc1q9h6mlk2j3kx4d3r5l8nzs7p2yfae6vd9lqxc8m",
    "network": "Bitcoin",
    "token": "BTC"
  },
  "user": {
    "uuid": "660e8400-e29b-41d4-a716-446655440001",
    "name": "Carlos Oliveira",
    "email": "carlos@example.com"
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
  "input_token": {
    "uuid": "220e8400-e29b-41d4-a716-446655440012",
    "name": "Bitcoin",
    "symbol": "BTC",
    "decimals": 8
  },
  "input_network": {
    "uuid": "330e8400-e29b-41d4-a716-446655440013",
    "name": "Bitcoin",
    "chain_id": 0,
    "is_testnet": false
  },
  "input_token_amount": "0.10000000",
  "created_at": "2025-01-12T10:00:00+00:00",
  "updated_at": "2025-01-12T11:30:00+00:00"
}
```

> **Same-token variant** (USDT direct deposit): the `input_token`, `input_network` and `input_token_amount` keys are absent. `payment_data.token` is `"USDT"` and `payment_data.network` is the deposit network name.

### Crypto withdrawal — USDT to external wallet

```json
{
  "uuid": "bb0e8400-e29b-41d4-a716-446655440006",
  "order_type": "withdrawal",
  "description": "USDT withdrawal to external wallet",
  "status": "finished",
  "payment": false,
  "fiat_amount": "0.0000",
  "crypto_full_amount": "250.000000",
  "nautt_quote": "1.0000",
  "out_blockchain_hash": "0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba",
  "destination_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "expire_at": "2025-01-11T10:00:00+00:00",
  "payment_data": {
    "payment_method": "crypto",
    "source_address": "0x1111111111111111111111111111111111111111",
    "network": "Polygon",
    "token": "USDT"
  },
  "user": {
    "uuid": "660e8400-e29b-41d4-a716-446655440001",
    "name": "Carlos Oliveira",
    "email": "carlos@example.com"
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
  "withdrawal_wallet": {
    "uuid": "dd0e8400-e29b-41d4-a716-446655440008",
    "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "label": "Personal Wallet"
  },
  "created_at": "2025-01-10T09:15:30+00:00",
  "updated_at": "2025-01-10T09:20:15+00:00"
}
```

`payer` is never returned on crypto withdrawal orders. `destination_address` is the user's external wallet address. For **cross-token withdrawals** (destination token differs from the platform's main token system), `output_token`, `output_network` and `output_token_amount` are also present, and `payment_data` carries `cross_network: true` together with `destination_network` and `destination_contract_address`.

## Status values

**Active**: `new`, `processing`, `paid`
**Final**: `finished`, `rejected`, `canceled`, `refunded`, `expired`

## Errors

**400 — Invalid UUID**
```json
{
  "message": "Invalid order UUID format",
  "code": "validation.invalid_uuid"
}
```

**403 — No permission**
```json
{
  "message": "Insufficient permissions",
  "code": "auth.insufficient_permissions"
}
```

**404 — Not found**
```json
{
  "message": "Order not found",
  "code": "order.not_found"
}
```
