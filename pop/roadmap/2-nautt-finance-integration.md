# Epoch 2 - Nautt Finance integration

- **Project:** [[PROJECT|QR Pagamentos]] - read for local identity, authorization, i18n, runtime, and secret constraints.
- **Roadmap:** [[ROADMAP|Roadmap]] - read for epoch boundaries.
- **Status:** em andamento
- **Yolo:** yes
- **Description:** Onboard encrypted per-user Nautt API keys with main-wallet balance, then provide server-side pricing, orders, polling, and central webhook intake without Nautt-hosted links.
- **Pause if:** Nautt's documented HMAC verification cannot be reproduced against the production dispatcher before an order-state-changing receiver is implemented.

## Recon and forks

- [[researches/nautt-finance/nautt-finance|Nautt Finance API synthesis]] - establishes API-key ownership, balance, quotes, onramp orders, provider order reads, webhook registration, and the provider gaps that remain.
- [[specs/nautt-finance-integration|Nautt Finance integration]] - records the application/provider boundary and security requirements.
- [ ] RECON NEEDED: ambiguous provider-order creation recovery - check: obtain Nautt's idempotency/header and timeout-recovery contract before allowing a retried checkout request to create an onramp order.
- [ ] RECON NEEDED: webhook lifecycle recovery - check: obtain Nautt's list/delete/recreate contract before supporting lost-secret recovery or key-rotation cleanup.
- Fork: if the production dispatcher fails the documented raw-body HMAC contract -> retain polling and do not accept an order-state-changing callback.
- Fork: if documented `/exchange-currencies` metadata becomes available -> validate administrator-entered currency/payment-method UUID pairings; otherwise retain explicit UUID validation only and keep unsupported pairs out of checkout.

## Phase 2.1 - Per-user provider access

- **Status:** pending
- **Description:** Store, validate, replace, and observe one Nautt credential per local user without exposing it.
- **Specs:** [[specs/nautt-finance-integration|Nautt Finance integration]]

| Task | Description | Status |
|------|-------------|--------|
| [[2.1.1-secure-per-user-nautt-credentials]] | Persist one owner-bound Nautt API key encrypted at rest with server-only decryption, redacted observability, safe replacement, and authorization tests. · size: L | done |
| [[2.1.2-onboard-nautt-key-and-wallet-balance]] | Deliver bilingual authenticated key onboarding that validates the caller-owned main wallet and presents balance, unavailable, and retry states without revealing the key. · size: M | 001_initial_task |
| [[2.1.3-register-owner-webhooks]] | Register the central HTTPS callback with each validated owner key, explicitly subscribe to documented lifecycle events, and persist the one-time provider webhook secret encrypted. · size: M | done |

## Phase 2.2 - Provider order boundary

- **Status:** pending
- **Description:** Establish owner-bound quote, onramp-order, provider-read, and polling contracts for later checkout consumption.
- **Specs:** [[specs/nautt-finance-integration|Nautt Finance integration]]

| Task | Description | Status |
|------|-------------|--------|
| [[2.2.1-build-nautt-pricing-and-order-adapter]] | Implement server-side exact-decimal quotes and owner-bound onramp/provider-order operations with five-minute quote expiry and no hosted-link calls. · size: L | concluída |
| [[2.2.2-model-provider-orders-and-safe-polling]] | Persist provider identifiers and non-final reconciliation state, preventing an older provider read from overwriting a final local state. · size: L | 001_initial_task |

## Phase 2.3 - Trusted event reconciliation

- **Status:** pending
- **Description:** Authenticate, deduplicate, acknowledge, and reconcile owner-scoped provider events against authoritative order reads.
- **Specs:** [[specs/nautt-finance-integration|Nautt Finance integration]]

| Task | Description | Status |
|------|-------------|--------|
| [[2.3.1-verify-and-handle-nautt-webhooks]] | Verify the raw request body with HMAC-SHA256 and constant-time comparison, deduplicate `X-Nautt-Delivery`, persist evidence, acknowledge within 15 seconds, and reconcile every event from the authoritative provider order read. · size: L | 001_initial_task |
| [[2.3.2-recover-nautt-webhook-deliveries]] | Reconcile documented delivery history and permanently failed deliveries without reprocessing a known delivery UUID or regressing a local terminal order state. · size: M | 001_initial_task |
