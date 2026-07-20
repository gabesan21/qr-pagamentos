# Nautt server integration contract

- Scope: server-only Nautt HTTP adapters and owner-bound provider orchestration.
- Read the repository-root [`AGENTS.md`](../../../AGENTS.md) before editing this subtree.
- [`../../../pop/specs/nautt-finance-integration.md`](../../../pop/specs/nautt-finance-integration.md) — follow when provider operations, credential ownership, or webhook lifecycle behavior changes.

## Protocol boundary

- Never import this subtree from a client component or expose provider response bodies, API keys, webhook secrets, or encrypted secret values.
- Resolve the provider base URL per call through the optional `NAUTT_API_BASE_URL` ENV, validated as canonical absolute HTTPS without credentials or a fragment and defaulting to `https://api.nauttfinance.com/api/v2`; send owner API keys only as `X-API-Key`.
- Never create or consume Nautt-hosted payment links.
- Validate operator-selected callback URLs before provider dispatch; require absolute HTTPS without embedded credentials or fragments.
- Keep documented request and response fields explicit; reject incomplete or contradictory success payloads.

## Non-idempotent webhook registration

- Never automatically retry `POST /client-webhooks`; provider idempotency and pre-commit error classes are undocumented.
- Claim `owner + UNREGISTERED + credential_revision` in durable state before reading ciphertext, decrypting, or dispatching registration; never use millisecond timestamps as revision identity.
- Only local failures with a proven provider call count of zero may remain `UNREGISTERED`.
- Once dispatch starts, preserve an ambiguous result as `INDETERMINATE` or `REGISTERING`; never authorize another POST from that state.
- Encrypt the one-time webhook secret immediately after parsing and return only redacted UUID, state, and timestamp metadata.
- Never invent list, get, delete, recreate, or key-rotation recovery semantics.

## Pricing and order boundary

- Keep monetary values as exact decimal strings end to end; never convert through `Number`, and reject signed, exponent, whitespace-padded, or non-positive input amounts before decryption or dispatch.
- Perform exactly one `POST /orders/onramp` attempt; every failure after dispatch is a redacted indeterminate result and is never retried. Only pre-dispatch validation/serialization failures are definitive.
- Map provider `403`/`404` on `GET /orders/{uuid}` to one indistinguishable not-found/not-owned result.
- Normalize `pix_qrcode ?? qrcode` as optional copy-and-paste data and keep `pix_qrcode_url` optional; when neither payload exists, leave the field absent instead of inventing a URL.
- Return only the minimal redacted quote/order DTO; never expose raw envelopes, payer/user objects, keys, or provider error bodies.
- Accept the owner identifier only from a trusted server caller; claim the quote UUID atomically for the same owner and fresh expiry before decrypting that owner's key, and clear local plaintext key references in `finally`.
- Keep quote/order persistence replaceable behind `ProviderOrderStore`; production uses the Prisma store, and tests may use the process-local implementation only as an injected double.
- Never release a quote after dispatch starts. Persist `INDETERMINATE` even when the provider UUID is unknown; only a durable known UUID authorizes explicit one-read recovery.
- Poll and recover only by trusted owner plus local order UUID. Final rows and unknown-ID ambiguity perform zero decryption/GET; versioned reconciliation discards stale responses without a second GET.

## Webhook intake

- Bound the body at 256 KiB while streaming once; never parse, decode, concatenate an oversized stream, or call `arrayBuffer()`/`json()` before authentication.
- Accept only one lowercase `sha256=<64 hex>` signature and compare the exact raw bytes against every active encrypted owner secret without early exit; zero or multiple matches disclose nothing and change no state.
- Persist normalized delivery/attempt evidence only after authentication. The processing lease must exceed the 14.5-second accepted-work budget with a safety margin; terminal replay, unknown/final order, and a live lease perform zero API-key decryption and provider GETs.
- Treat notification status as untrusted. An actionable delivery performs at most one owner-bound `GET /orders/{uuid}` and reuses the shared versioned CAS before durable delivery finalization.
- Return `204` only after a durable processed/ignored decision; malformed authenticated input is `400`, authentication is `401`, oversize is `413`, and busy/retryable work is `503`, always with an empty no-store body.

## Webhook delivery recovery

- Recovery is an explicit trusted owner/local-order operation; never add an automatic scheduler, route, UI, or browser-selected provider identity without a separate approved task.
- Keep delivery-history transport behind the normalized injected port. Never infer an HTTP status, response envelope, wrapper, pagination rule, or failed-field nullability absent from the supplied provider material.
- Enforce one selected history call with a service-issued 10-second abort deadline; cancellation-ignoring late settlement must remain inert, with no retry, order GET, or persistence.
- Reject order-history lists above the application-local 128-record bound before validation/reconciliation/writes. Known specific UUIDs must stop before lease, secret, network, and write work.
- Keep the 30-second recovery lease fenced around the 25-second accepted budget. All new failed deliveries for one order share at most one authoritative order GET; final orders record ignored evidence with zero GET.

## Verification

- Inject network and timeout boundaries in tests; never call Nautt during automated tests.
- Cover exact request shape, complete success parsing, timeout/transport ambiguity, response redaction, and no-retry transitions.
- For credential onboarding, validate the submitted key through the main-wallet read before an atomic ciphertext+fresh-UUID CAS; a stale UUID performs zero ciphertext read, decryption, or dispatch.
- Cover the claim matrix (unknown, cross-owner, expired, consumed, duplicate register) with zero-decryption/zero-fetch assertions.
- Cover byte mutation, malformed-signature zero-comparison cleanup, all-candidate comparison, bounded-stream cancellation, delivery races/safe lease reclaim, terminal replay, and the 15-second/one-GET economic bound.
