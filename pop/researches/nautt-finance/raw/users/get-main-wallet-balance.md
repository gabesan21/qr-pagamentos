# Get main wallet balance

Returns the real-time on-chain balance of the platform's **main token** on the user's main wallet. The main token is the unique `tokens_system` row flagged as `main = true`, so the response is always a single object scoped to that token and its network.

```
GET /api/v2/users/wallets/main/balances
```

**Authentication**: `X-API-Key`

## Query parameters

| Parameter   | Type | Required | Description                                                                                                               |
| ----------- | ---- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `user_uuid` | UUID | No       | Target user whose balance to fetch. Defaults to the authenticated user. Requires `users.view` permission and ownership scope over the target. |

## Examples

```bash
# Balance of the authenticated user's main wallet
curl -X GET \
  'https://api.nauttfinance.com/api/v2/users/wallets/main/balances' \
  -H 'X-API-Key: ntt_your_key_here'

# Balance of another user (requires users.view + ownership scope)
curl -X GET \
  'https://api.nauttfinance.com/api/v2/users/wallets/main/balances?user_uuid=550e8400-e29b-41d4-a716-446655440000' \
  -H 'X-API-Key: ntt_your_key_here'
```

## Response (200)

```json
{
  "message": "Balances retrieved successfully",
  "code": "wallet.balances_retrieved",
  "data": {
    "token_symbol": "USDT",
    "token_name": "Tether USD",
    "network_name": "Polygon Mainnet",
    "balance": "17.271189"
  }
}
```

**Notes**:
- `balance` is human-readable — already scaled by the token's decimals — not a raw wei value.
- The main token is the single `tokens_system` row with `main = true`; the endpoint never returns balances for other tokens.
- The on-chain call has a 10-second timeout; timeouts surface as `500 system.internal_error`.

## Errors

**401 — Missing or invalid API key**
```json
{ "message": "Authentication required", "code": "auth.unauthorized" }
```

**403 — Insufficient permissions**
```json
{ "message": "Insufficient permissions", "code": "auth.insufficient_permissions" }
```
Returned when reading another user's balance without `users.view` permission, or when the target user is outside the caller's ownership scope.

**404 — User not found**
```json
{ "message": "User not found", "code": "user.not_found" }
```

**404 — Main wallet not found**
```json
{ "message": "Main wallet not found for user", "code": "wallet.main_wallet_not_found" }
```

**500 — Internal error**
```json
{ "message": "Internal server error", "code": "system.internal_error" }
```
Returned when the main token is not configured, the RPC endpoint is unreachable or misconfigured, the balance call exceeds the 10-second timeout, or a repository/database error occurs.
