# Spec - Nautt Finance integration

- **Project:** [[PROJECT|QR Pagamentos]]
- **Epoch/Phase:** [[roadmap/2-nautt-finance-integration|Epoch 2]]
- **Status:** aprovada
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
- Onboarding validates a submitted key with `GET /users/wallets/main/balances` before changing persisted credentials. An authentication failure, timeout, transport failure, or incomplete balance response leaves the prior credential and webhook-registration row unchanged and presents only a localized unavailable/invalid-key recovery state.
- Each credential row carries a non-null unique UUID `credential_revision` rotation token independent of millisecond timestamps. Onboarding snapshots that server-side token before validation, then persists the validated key and a freshly generated token in one compare-and-swap against the prior token (`null` means insert-if-absent). The winning request already knows its committed fresh token; webhook registration must durably claim `owner + UNREGISTERED + exact token` before reading/decrypting the ciphertext or dispatching. A concurrent request that loses either compare-and-swap or exact-token claim returns an opaque localized conflict and performs no decryption or registration; no request may register or report a key revision other than the one it validated and successfully persisted.
- Once a validated key is persisted, onboarding invokes owner webhook registration with the operator-configured canonical `NAUTT_WEBHOOK_CALLBACK_URL`. The callback must be an absolute HTTPS URL and is never derived from browser input, `Host`, or forwarded headers. A proven pre-dispatch registration failure may be retried manually from `UNREGISTERED`; `REGISTERING` and `INDETERMINATE` remain recovery-only and are never retried automatically.
- The authenticated settings screen reads the persisted owner's balance on the server. A later balance failure keeps the credential configured, exposes no provider body or key, and offers an explicit user-initiated retry; the application never retries a failed balance read automatically.
- The displayed balance is never interpreted as raw wei and is scoped to the API key owner's main wallet.
- Server-side pricing accepts the administrator-configured Nautt `currency_uuid` and `exchange_currency_uuid` from a trusted server caller and posts them with exactly one positive exact-decimal `amount` or `amount_usd` to `/pricing/panel/buy`; the adapter never sources provider UUIDs from environment variables. The returned `quote_uuid` expires five minutes after the validated response is received and is required for `POST /orders/onramp`.
- The server-side adapter binds quote, onramp creation, and provider reads to a locally derived owner identifier and decrypts exactly that owner's API key; authenticated callers derive it from the session and later public checkout derives it from the persisted payment link, never from a browser-supplied owner field or provider response. A replaceable quote-ownership port keys authoritative owner and expiry by `quote_uuid`, registers at issuance, and atomically claims once for same-owner fresh creation before credential decryption or provider dispatch. Task 2.2.1's initial in-memory implementation established the opaque failure contract; the persisted-order boundary replaces only that implementation with durable state, preserving duplicate, rejected-store, cross-owner, unknown, expired, and consumed outcomes as one unavailable result with no raw store error or provider fallback. The adapter uses a fixed 10-second client timeout and returns only the minimum redacted quote/order DTO, preserving monetary strings and normalizing `pix_qrcode ?? qrcode` as optional PIX copy-and-paste data.
- The adapter performs exactly one `POST /orders/onramp` attempt and never retries an ambiguous provider result. The persisted-order boundary supplies durable local attempt identity, duplicate suppression, and provider-identifier persistence without depending on provider idempotency. Only provider-side deduplication and recovery when an ambiguous attempt has no known provider UUID remain blocked on Nautt's undocumented idempotency/pre-commit and lookup contract.
- Provider order reads use `GET /orders/{uuid}` with the owner's key. Local polling reconciles only `new`, `processing`, and `paid` records and never overwrites a final `finished`, `rejected`, `canceled`, `refunded`, or `expired` state with an older provider response.
- Quote ownership and its single order-creation claim are durable and owner-bound. Claiming a fresh quote atomically creates one local order attempt before credential decryption or provider dispatch; replay, restart, expiry, and cross-owner use cannot authorize a second `POST`. A complete provider response persists its immutable provider UUID, documented status, exact decimal strings, and minimal redacted payment metadata. An unresolved post-dispatch outcome is always locked against create retry. If its provider UUID was durably learned from a complete response, explicit recovery may use one authoritative owner-bound provider read; without a known UUID it stays indeterminate/manual because no lookup contract exists.
- Polling is an injected one-order operation rather than an undocumented scheduler. It reads only a locally `CREATED` order in `new`, `processing`, or `paid`; explicit recovery reads only an indeterminate order with a durable provider UUID. Each uses that record's owner credential, performs at most one provider GET, and reconciles through one shared atomic transition policy. The write must still match owner, provider UUID, observed reconciliation version, and an allowed current state; a concurrent change discards the stale response, and every final state is immutable. Webhook-authoritative reads reuse this policy.
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
- Server-only exact-decimal pricing, one-shot onramp creation, opaque owner-scoped reads, and a replaceable UUID-keyed quote-ownership store that claims before credential decryption and fails closed across replay, ownership mismatch, expiry, duplicate registration, and store rejection (task 2.2.1).
- Bilingual owner onboarding with validate-before-save UUID revision pinning, exact-claim webhook registration, and redacted main-wallet balance, unavailable, retry, and recovery states (task 2.1.2).
- Durable owner-bound quote and provider-order persistence with atomic one-shot creation claims, exact-decimal redacted order fields, known-UUID explicit recovery, injected one-order polling, and shared versioned compare-and-swap reconciliation that prevents stale or final-state regression (task 2.2.2).

## Open

- API-key encryption-key lifecycle and rotation in the self-hosted deployment.
- Webhook list/delete/recreate operations and the key-rotation/lost-secret recovery procedure.
- Provider-side idempotency and recovery after a timed-out creation with no known provider UUID; until documented, the attempt stays indeterminate/manual and never retries automatically. Known UUIDs may use only the existing authoritative owner-bound order read.
- Exact `deposit_fields` required for each configured UUID pair, quote-refresh behavior, monetary-field semantics/rounding, rate limits, and polling interval.

## Related specs

- [[specs/product-scope|Product scope]] - follow when provider constraints affect user-visible payment behavior.
- [[researches/nautt-finance/nautt-finance|Nautt Finance API synthesis]] - follow before planning API-key onboarding, balance, pricing, orders, or webhooks.
