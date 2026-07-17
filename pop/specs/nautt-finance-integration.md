# Spec - Nautt Finance integration

- **Project:** [[PROJECT|QR Pagamentos]]
- **Epoch/Phase:** [[roadmap/2-nautt-finance-integration|Epoch 2]]
- **Status:** in progress
- **Created:** 2026-07-13

## What it covers

This spec defines the allowed boundary between QR Pagamentos and Nautt Finance from the ingested repository documentation. Documented provider operations are planned now; only the explicitly listed undocumented behavior remains open.

## Requirements

- The integration uses Nautt Finance only to obtain onramp quotes, open and query orders, register and receive provider webhooks, and read the authenticated user's main-wallet balance.
- The integration never creates or uses Nautt-hosted payment links.
- Production requests use `https://api.nauttfinance.com/api/v2`; the documented sandbox host is `https://api-stage.nauttfinance.com/api/v2`, subject to the recorded webhook-example hostname discrepancy.
- Each user supplies one individual Nautt API key through the application, and the system associates every provider operation with that owner. Nautt keys are sent only as `X-API-Key`; a provider key replacement revokes the previous provider key.
- API keys are encrypted at rest, available only to server-side integration code, and redactable in logs. Replacement is allowed while webhook registration is `UNREGISTERED`; once it is `REGISTERING`, `ACTIVE`, or `INDETERMINATE`, replacement is rejected without changing the credential or registration row until documented webhook lifecycle recovery can preserve the owner binding.
- Saving a validated API key registers the system's central HTTPS webhook URL through `POST /client-webhooks`, explicitly subscribes to the documented lifecycle events, stores the returned webhook UUID and one-time secret encrypted, and never logs or returns that secret after persistence.
- Webhook registration treats only local failures that prove request dispatch never started and the row remained `UNREGISTERED` as definitively safe to retry. Once dispatch starts, every non-`201`, unusable or incomplete `201`, timeout, transport failure, or post-response encryption/persistence failure is `INDETERMINATE`; it never triggers an automatic retry or API-key replacement because Nautt does not document pre-commit error classes or registration idempotency.
- After a successful API key save, the same settings screen queries `GET /users/wallets/main/balances` without `user_uuid` and displays `token_symbol`, `token_name`, `network_name`, and the decimal `balance` returned by Nautt.
- The displayed balance is never interpreted as raw wei and is scoped to the API key owner's main wallet.
- Server-side pricing accepts the administrator-configured Nautt `currency_uuid` and `exchange_currency_uuid` from a trusted server caller and posts them with exactly one positive exact-decimal `amount` or `amount_usd` to `/pricing/panel/buy`; the adapter never sources provider UUIDs from environment variables. The returned `quote_uuid` expires five minutes after the validated response is received and is required for `POST /orders/onramp`.
- The server-side adapter binds quote, onramp creation, and provider reads to a locally derived owner identifier and decrypts exactly that owner's API key; authenticated callers derive it from the session and later public checkout derives it from the persisted payment link, never from a browser-supplied owner field or provider response. A replaceable quote-ownership store keys authoritative owner and expiry by `quote_uuid`, registers at issuance, and atomically claims once for same-owner fresh creation before credential decryption or provider dispatch. The initial in-memory store accepts a serialized/reconstructed reference on the same instance but fails closed after restart/another instance; cross-owner, unknown, expired, and consumed references receive one opaque failure with no provider fallback. Its one-instance consumption guard is not application/provider idempotency; task 2.2.2 may replace the store with durable state without changing the adapter's public contract. The adapter returns only the minimum redacted quote/order DTO, preserving monetary strings and normalizing `pix_qrcode ?? qrcode` as optional PIX copy-and-paste data.
- The adapter performs exactly one `POST /orders/onramp` attempt and never retries an ambiguous provider result. Durable local idempotency, provider-identifier persistence, and timeout recovery belong to the persisted-order boundary (task 2.2.2) and remain blocked on Nautt's undocumented idempotency/pre-commit contract.
- Provider order reads use `GET /orders/{uuid}` with the owner's key. Local polling reconciles only `new`, `processing`, and `paid` records and never overwrites a final `finished`, `rejected`, `canceled`, `refunded`, or `expired` state with an older provider response.
- Webhooks verify the exact raw request bytes with `HMAC-SHA256(secret, rawBody)`, compare the expected `sha256=<hex>` value from `X-Nautt-Signature` in constant time, and reject a failed verification before parsing or changing state.
- Webhook handling persists and uniquely deduplicates `X-Nautt-Delivery`; a replay of an already processed delivery is a no-op. It records the event and attempt evidence, returns a `2xx` response within 15 seconds only after durable idempotency work succeeds, and accepts Nautt's five retry attempts at 10, 20, 40, 80, and 160 seconds after failure.
- The handler treats `X-Nautt-Event` and the JSON envelope as a notification, then re-fetches `GET /orders/{uuid}` with the correct owner's key as the authoritative order state. `order.failed` is an event type, not an order status, and triggers the same authoritative read; the table and polling classify `paid`, `processing`, and `finished` as payment-confirmed while only final states stop reconciliation.
- The integration reconciles documented webhook-delivery history, including permanently failed deliveries, without reprocessing a known delivery UUID or regressing a local terminal order state.
- Fiat amounts, currencies, provider fees, conversion results, and USDT settlement data use exact decimal representations.
- Provider failures produce bounded retries and observable error states without leaking credentials or raw sensitive payloads.

## Out of scope

- Product, link, checkout, and storefront ownership remains entirely inside QR Pagamentos.
- Inventing undocumented Nautt endpoints, signatures, statuses, or retry guarantees is forbidden.
- Other payment providers are outside the MVP.

## Implemented slices

- Per-user encrypted Nautt API-key storage with server-only AES-256-GCM decryption, owner-or-admin authorization, redacted DTOs, and safe replacement (task 2.1.1).
- Owner-scoped central webhook registration with an atomic pre-dispatch claim, explicit documented event subscriptions, encrypted one-time-secret persistence, conservative `INDETERMINATE` handling after every ambiguous dispatch, and API-key replacement blocked outside `UNREGISTERED` (task 2.1.3).

## Open

- Whether the admin-configured webhook URL is the central Nautt callback or a downstream forwarding destination.
- Whether a balance timeout or missing main wallet blocks API key persistence, only suppresses the balance panel, or offers an explicit retry.
- API-key encryption-key lifecycle and rotation in the self-hosted deployment.
- Webhook list/delete/recreate operations and the key-rotation/lost-secret recovery procedure.
- Idempotency support supplied by Nautt and the recovery procedure after a timed-out provider-order creation; until resolved, the adapter reports every post-dispatch creation failure as indeterminate and never retries automatically.
- Exact `deposit_fields` required for each configured UUID pair, quote-refresh behavior, QR-field selection, monetary-field semantics/rounding, rate limits, client timeouts, and polling interval.

## Related specs

- [[specs/product-scope|Product scope]] - follow when provider constraints affect user-visible payment behavior.
- [[researches/nautt-finance/nautt-finance|Nautt Finance API synthesis]] - follow before planning API-key onboarding, balance, pricing, orders, or webhooks.
