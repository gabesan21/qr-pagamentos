# Epoch 0 - Maintenance

- **Project:** [[PROJECT|QR Pagamentos]] - read for local identity, authorization, i18n, runtime, and secret constraints.
- **Roadmap:** [[ROADMAP|Roadmap]] - read for epoch boundaries.
- **Status:** contínua
- **Description:** Correções e ajustes pontuais fora do plano - nunca conclui.

## Recon and forks

- [[researches/nautt-finance/nautt-finance|Nautt Finance API synthesis]] - establishes the provider base URL, webhook registration non-idempotency, and the undocumented lifecycle-recovery gaps.

## Phase 0.1 - Pontual fixes

- **Status:** em andamento
- **Description:** Correções pontuais de operação e configuração.

| Task | Description | Status |
|------|-------------|--------|
| [[0.1.4-fix-pay-locale-test-copy]] | Repair the pre-existing `/pay` unavailable-page test failure (asserts English copy while unauthenticated default locale is pt-BR) that breaks the aggregate gate. · size: S · yolo: sim | 001_initial_task |
| [[0.1.5-fail-closed-customer-policy-snapshot]] | Make `toPolicySnapshot` fail-closed: an unknown checkout policy exposes no customer data. · size: S · yolo: sim | 001_initial_task |
