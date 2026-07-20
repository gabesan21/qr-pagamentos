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
| [[0.1.1-configurable-nautt-base-url]] | Move the Nautt provider base URL from hardcoded constant to validated server ENV so operators can point at production or sandbox. · size: S · yolo: sim | concluída |
| [[0.1.2-reset-nautt-credential-onboarding]] | Let an authenticated owner reset a failed or ambiguous Nautt credential/webhook onboarding back to a retryable state. · size: M · critical: sim · yolo: sim | concluída |
| [[0.1.3-accept-real-webhook-registration-envelope]] | Accept the real production `POST /client-webhooks` envelope (no `success` field) so successful registrations stop being misclassified as indeterminate. · size: S · critical: sim · yolo: sim | concluída |
