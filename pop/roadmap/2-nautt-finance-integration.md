# Epoch 2 - Nautt Finance integration

- **Project:** [[PROJECT|QR Pagamentos]] - read for local identity, authorization, i18n, runtime, and secret constraints.
- **Roadmap:** [[ROADMAP|Roadmap]] - read for epoch boundaries.
- **Status:** concluída
- **Yolo:** yes
- **Description:** Onboard encrypted per-user Nautt API keys with main-wallet balance, then provide server-side pricing, orders, polling, authenticated central webhook intake, and failed-delivery recovery without Nautt-hosted links.

## Recon and forks

- [[researches/nautt-finance/nautt-finance|Nautt Finance API synthesis]] - establishes API-key ownership, balance, quotes, onramp orders, provider order reads, webhook registration, and the provider gaps that remain.
- [[specs/nautt-finance-integration|Nautt Finance integration]] - records the application/provider boundary and security requirements.
- [ ] RECON NEEDED: ambiguous provider-order creation recovery - check: obtain Nautt's idempotency/header and timeout-recovery contract before allowing a retried checkout request to create an onramp order.
- [ ] RECON NEEDED: webhook lifecycle recovery - check: obtain Nautt's list/delete/recreate contract before supporting lost-secret recovery or key-rotation cleanup.
- Fork: if documented `/exchange-currencies` metadata becomes available -> validate administrator-entered currency/payment-method UUID pairings; otherwise retain explicit UUID validation only and keep unsupported pairs out of checkout.

## Phase 2.1 - Per-user provider access

- **Status:** concluída
- **Description:** Store, validate, replace, and observe one Nautt credential per local user without exposing it.
- **Specs:** [[specs/nautt-finance-integration|Nautt Finance integration]]

| Task | Description | Status |
|------|-------------|--------|

## Phase 2.2 - Provider order boundary

- **Status:** concluída
- **Description:** Establish owner-bound quote, onramp-order, provider-read, and polling contracts for later checkout consumption.
- **Specs:** [[specs/nautt-finance-integration|Nautt Finance integration]]

| Task | Description | Status |
|------|-------------|--------|

## Phase 2.3 - Trusted event reconciliation

- **Status:** concluída
- **Description:** Authenticate, deduplicate, acknowledge, and reconcile owner-scoped provider events against authoritative order reads.
- **Specs:** [[specs/nautt-finance-integration|Nautt Finance integration]]

| Task | Description | Status |
|------|-------------|--------|
