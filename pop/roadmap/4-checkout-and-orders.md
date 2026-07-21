# Epoch 4 - Checkout and order lifecycle

- **Project:** [[PROJECT|QR Pagamentos]]
- **Status:** pendente
- **Description:** Deliver owner-isolated public checkout, QR payment generation, account-level customer-data policies, and order views.
- **Yolo:** sim

## Recon and decisions

- Existing products and payment links have no production data, so Epoch 4 introduces required ownership without a legacy-data migration path.
- Every product and payment link belongs to exactly one user; users cannot read or mutate another user's records, while administrators retain their global operational role.
- A single-use link remains available through unsuccessful and pending attempts, is consumed only by a confirmed successful payment, and cannot begin checkout after its expiry.
- Each account configures the customer data requested by its public checkouts. The default is `NONE`; supported policies are `NAME_EMAIL`, `EMAIL`, `NAME_EMAIL_CPF`, and `NAME_EMAIL_CPF_ADDRESS`.
- The public checkout derives its provider credential and all payable values from persistent owner-bound records, never browser input.

## Phase 4.1 — Ownership and order contracts

- **Status:** pending
- **Description:** Establish owner isolation, account checkout policy, and durable payment-link order lifecycle records.
- **Specs:** [[specs/product-scope|Product scope]], [[specs/checkout-and-order-lifecycle|Checkout and order lifecycle]]

| Task | Description (≤1 line) | Status |
|------|----------------------|--------|
| [[4.1.1-owner-isolation-and-checkout-policy]] | Add required product/link ownership and the account-level customer-data policy with `NONE` as default. · size: L | 001_initial_task |
| `4.1.2-payment-link-order-lifecycle` | Persist owner-bound checkout orders, field snapshots, status transitions, expiry, and single-use settlement rules. · size: L | not started |

## Phase 4.2 — Public checkout

- **Status:** pending
- **Description:** Create the secure public payment flow and its bilingual QR status experience.
- **Specs:** [[specs/checkout-and-order-lifecycle|Checkout and order lifecycle]], [[specs/nautt-finance-integration|Nautt Finance integration]]

| Task | Description (≤1 line) | Status |
|------|----------------------|--------|
| `4.2.1-public-checkout-orchestration` | Create orders from active owner-bound links and generate Nautt QR payments without exposing trusted inputs. · size: L | not started |
| `4.2.2-public-checkout-experience` | Deliver the bilingual policy-driven checkout, QR payment state, and customer-facing status updates. · size: L | not started |

## Phase 4.3 — Order operations

- **Status:** pending
- **Description:** Provide protected order visibility for owners and administrators.
- **Specs:** [[specs/product-scope|Product scope]], [[specs/checkout-and-order-lifecycle|Checkout and order lifecycle]]

| Task | Description (≤1 line) | Status |
|------|----------------------|--------|
| `4.3.1-owner-and-admin-order-views` | Add owner-scoped and administrator order views with protected customer-data access. · size: L | not started |
