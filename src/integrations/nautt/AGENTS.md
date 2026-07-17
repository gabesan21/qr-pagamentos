# Nautt server integration contract

- Scope: server-only Nautt HTTP adapters and owner-bound provider orchestration.
- Read the repository-root [`AGENTS.md`](../../../AGENTS.md) before editing this subtree.
- [`../../../pop/specs/nautt-finance-integration.md`](../../../pop/specs/nautt-finance-integration.md) — follow when provider operations, credential ownership, or webhook lifecycle behavior changes.

## Protocol boundary

- Never import this subtree from a client component or expose provider response bodies, API keys, webhook secrets, or encrypted secret values.
- Production calls use only `https://api.nauttfinance.com/api/v2` and send owner API keys only as `X-API-Key`.
- Never create or consume Nautt-hosted payment links.
- Validate operator-selected callback URLs before provider dispatch; require absolute HTTPS without embedded credentials or fragments.
- Keep documented request and response fields explicit; reject incomplete or contradictory success payloads.

## Non-idempotent webhook registration

- Never automatically retry `POST /client-webhooks`; provider idempotency and pre-commit error classes are undocumented.
- Claim the owner credential revision in durable state before dispatching registration.
- Only local failures with a proven provider call count of zero may remain `UNREGISTERED`.
- Once dispatch starts, preserve an ambiguous result as `INDETERMINATE` or `REGISTERING`; never authorize another POST from that state.
- Encrypt the one-time webhook secret immediately after parsing and return only redacted UUID, state, and timestamp metadata.
- Never invent list, get, delete, recreate, or key-rotation recovery semantics.

## Verification

- Inject network and timeout boundaries in tests; never call Nautt during automated tests.
- Cover exact request shape, complete success parsing, timeout/transport ambiguity, response redaction, and no-retry transitions.
