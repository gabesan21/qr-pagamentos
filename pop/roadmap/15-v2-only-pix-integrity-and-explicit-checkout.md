# Epoch 15 - V2-only, PIX integrity and explicit checkout

- **Project:** [[PROJECT|QR Pagamentos]]
- **Roadmap:** [[ROADMAP|Roadmap]]
- **Status:** em andamento
- **Description:** Remove the V1 payment-link/checkout/order line integrally, make PIX data durable and provider errors fail closed, and give the public checkout explicit no-retry states on the project's own template contract.
- **Yolo:** não — every task stops at `003_human_approval` for coordination (user command 2026-09-22); the `005_closing` gate is the human PR.
- **Pause if:** V1 removal would require touching the Nautt webhook URL registration surface, `NAUTT_API_BASE_URL`, or any Commerce V2 business/security/exact-decimal contract beyond the recorded amendments.

## Recon and forks

- [[researches/pix-checkout-review/2026-09-22-review-findings|PIX and checkout review findings]] - confirmed defects with file:line evidence, the retry surfaces to remove and the complete V1 footprint; source for every task below.
- [[notes/decisions/2026-09-22-v1-removal-and-checkout-decisions|2026-09-22 decisions]] - the six sovereign decisions, the destructive migration authorization and the explicit out-of-scope list.
- [[researches/nautt-finance/nautt-finance|Nautt Finance API synthesis]] - documented creation error codes and the `qrcode`/`pix_qrcode` normalization rule.
- [ ] RECON NEEDED: which `exchange_currency_uuid` values produce a PIX/BRL order - check: `nautt-exchange-currencies-contract` prompt in [[RESEARCHES|RESEARCHES]] (feeds Epoch 13, not this epoch).
- Fork: if the migration-policy verifier cannot express the baseline rebase without a new closed operation, 15.1.2 extends the manifest language under the same destructive authorization instead of hand-editing SQL.
- Fork: if a V2 module still imports a V1 helper for non-V1 behavior, 15.1.1 relocates the helper into the V2 module; it never keeps a V1 file alive for it.

## Phase 15.1 - V1 removal

- **Status:** concluída
- **Description:** Delete every V1 surface, table and contract; the application, its specs and its parity records describe Commerce V2 only.
- **Specs:** [[specs/checkout-and-order-lifecycle|Checkout and order lifecycle]], [[specs/catalog-and-payment-links|Catalog and payment links]], [[specs/administrative-foundation|Administrative foundation]]

| Task | Description | Status |
|------|-------------|--------|

## Phase 15.2 - PIX integrity

- **Status:** concluída
- **Description:** Reconciliation never erases PIX, documented provider creation errors fail closed, and the order's payment method is visible to its owner.
- **Specs:** [[specs/nautt-finance-integration|Nautt Finance integration]], [[specs/checkout-and-order-lifecycle|Checkout and order lifecycle]]

| Task | Description | Status |
|------|-------------|--------|

## Phase 15.3 - Explicit checkout

- **Status:** concluída
- **Description:** The buyer checkout shows explicit states with "Start over" as the only action, hides the customer block for policy `NONE`, and converges on the template's vocabulary and AA rules.
- **Specs:** [[specs/checkout-and-order-lifecycle|Checkout and order lifecycle]], [[specs/application-frontend-system|Application frontend system]]

| Task | Description | Status |
|------|-------------|--------|

## Phase 15.4 - Visual drift sweep

- **Status:** em andamento
- **Description:** Migrate remaining surfaces to the declared template vocabulary and 44 px targets; materialized after Phase 15.3 closes.

| Task | Description | Status |
|------|-------------|--------|
| [[15.4.2-fix-target-sizes-and-dictionary-debt]] | 44 px steppers and period controls, the 143 unreferenced keys (F4) and plural form, and the two parity-gate repairs (F2 tracked-tree derivation, F5 checkout loading obligations). · size: M | 003_human_approval |
| [[15.4.3-phase-verification]] | Write/run the phase suite and repair only phase defects; consolidates the epoch's human checklist for the `develop` → `main` PR. · size: S | 003_human_approval |

## Dependency and parallel-wave map

- 15.1 first: 15.1.1 alone, then 15.1.2 and 15.1.3 in parallel (disjoint write sets: `prisma/**`+`container/**`+`install/**` vs `pop/specs/**`+DOX+`docs/frontend-template-parity/**`), then 15.1.4.
- 15.2 and 15.3 start after 15.1.4. Inside each phase the tasks are serialized by `depends_on` (15.2.1 → 15.2.2 → 15.2.3; 15.3.1 → 15.3.2 → 15.3.3) because the 002 plans share files within the phase; across phases 15.2.x and 15.3.x may run in parallel, except 15.2.3, which also waits for 15.3.1 (same browser parser files). At most three tasks at a time.
- 15.4 after 15.3.4; the `develop` → `main` PR opens when the last phase verification closes.
