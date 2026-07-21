# Epoch 3 - Catalog and payment links

- **Project:** [[PROJECT|QR Pagamentos]] - read for local identity, authorization, i18n, runtime, and secret constraints.
- **Roadmap:** [[ROADMAP|Roadmap]] - read for epoch boundaries.
- **Status:** concluída
- **Yolo:** yes
- **Description:** Manage administrator-configured database records for Nautt currency and payment-method UUIDs, products, and active single-use or reusable payment links with one configured currency each.

## Recon and forks

- [[specs/catalog-and-payment-links|Catalog and payment links]] - records the admin-only CRUD, UUID validation, exact-decimal pricing, and redacted public-link contract.
- [[researches/nautt-finance/nautt-finance|Nautt Finance API synthesis]] - establishes that provider UUIDs are opaque to the application and must be configured by administrators.
- [ ] RECON NEEDED: exact Nautt metadata endpoint for live UUID validation - check: only add live validation after a documented, stable endpoint exists; until then, validate UUID format only.
- Fork: if Nautt exposes `/exchange-currencies` metadata with human-readable labels → auto-populate catalog labels; otherwise labels remain administrator-editable.

## Phase 3.1 - Nautt currency and payment-method catalog

- **Status:** concluída
- **Description:** Let administrators manage the approved Nautt currency_uuid / exchange_currency_uuid and payment-method UUID pairs that later products and payment links may use.
- **Yolo:** yes
- **Specs:** [[specs/catalog-and-payment-links|Catalog and payment links]]
- **Frontend execution gate:** Every Phase 3.1 frontend task must declare `clean-code-change` and `ui-change` in its 004 card row, and `clean-code-review` and `ui-review` in its 005 row.

| Task | Description | Status |
|------|-------------|--------|

## Phase 3.2 - Product management

- **Status:** concluída
- **Description:** Let administrators create and manage products with bilingual fields, exact-decimal pricing, and active status.
- **Yolo:** yes
- **Specs:** [[specs/catalog-and-payment-links|Catalog and payment links]]
- **Frontend execution gate:** Every Phase 3.2 frontend task must declare `clean-code-change` and `ui-change` in its 004 card row, and `clean-code-review` and `ui-review` in its 005 row.

| Task | Description | Status |
|------|-------------|--------|

## Phase 3.3 - Payment links

- **Status:** concluída
- **Description:** Let administrators generate single-use or reusable payment links bound to one product and one configured currency pair.
- **Yolo:** yes
- **Specs:** [[specs/catalog-and-payment-links|Catalog and payment links]]
- **Frontend execution gate:** Every Phase 3.3 frontend task must declare `clean-code-change` and `ui-change` in its 004 card row, and `clean-code-review` and `ui-review` in its 005 row.

| Task | Description | Status |
|------|-------------|--------|
