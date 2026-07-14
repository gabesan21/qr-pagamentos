# Nautt API — Usage Guide

This guide is for developers who want to integrate with the Nautt API programmatically using API Keys.

| Environment | Base URL                                    |
| ----------- | ------------------------------------------- |
| Production  | `https://api.nauttfinance.com/api/v2`       |
| Sandbox     | `https://api-stage.nauttfinance.com/api/v2` |

---

## Authentication

The API uses **API Keys** for programmatic authentication. Each key identifies its owner and inherits all of that user's permissions.

Keys follow the format `ntt_<string>` and are sent in the `X-API-Key` header with each request.

### Obtaining your API Key

API Keys are generated exclusively through the **Nautt panel**. Each user can have at most one active key — generating a new one automatically revokes the previous one.

When generating the key, the full value is displayed **only once**. Store it securely.

### Making an authenticated request

```bash
curl -X GET \
  'https://api.nauttfinance.com/api/v2/users/profile' \
  -H 'X-API-Key: ntt_your_key_here'
```

### Response language

You can control the language of error and response messages with the `Accept-Language` header:

```bash
curl -X GET \
  'https://api.nauttfinance.com/api/v2/users/profile' \
  -H 'X-API-Key: ntt_your_key_here' \
  -H 'Accept-Language: pt-BR'
```

Supported values: `pt-BR`, `en`, `es`.

---

## Common errors

| Code  | Meaning                                          |
| ----- | ------------------------------------------------ |
| `401` | Invalid, missing, or revoked key                 |
| `403` | Valid key, but no permission for this endpoint    |
| `404` | Resource not found                               |
| `429` | Too many requests — wait before trying again     |

---

## Available endpoints

- **[Users](./users/index.md)** — Authenticated user profile and account data.

- **[Orders](./orders/index.md)** — Creation and retrieval of cryptocurrency deposit and withdrawal orders.

- **[Payments](./payments/index.md)** — Decode PIX BR Codes and pay a pasted copia-e-cola via an off-ramp order.

- **[Payment links](./payment-links/index.md)** — Generation and management of payment links for end customers.

- **[Pricing](./pricing/index.md)** — Real-time quotes and conversions between fiat currencies and crypto assets.

- **[Bank accounts](./users-bank-accounts/index.md)** — Registered bank accounts for withdrawals and receiving funds.

- **[Withdrawal wallets](./withdrawal-wallets/index.md)** — Pre-approved wallet addresses for sending crypto assets.

- **Tokens and networks** — Tokens available on the platform and their blockchain networks. See [Exchange tokens](./exchange-tokens/index.md).

- **[Exchange currencies](./exchange-currencies/index.md)** — Currency configurations for exchange, including limits and payment methods.

- **[Exchange tokens](./exchange-tokens/index.md)** — Token-network pairs supported for exchange on Nautt.

- **[SAIQ integration](./saiq/index.md)** — KYB session data in SAIQ format: list, retrieve, and update business verification sessions.
