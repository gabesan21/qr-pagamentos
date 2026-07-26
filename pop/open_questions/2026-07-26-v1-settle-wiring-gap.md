---
status: aberta
origem: projeto
created: 2026-07-26
---

# V1 settle-wiring gap: webhook reconciliation never settles V1 orders

Task [[9.2.1-implement-standalone-payment-orders]] confirmed during recon that neither the V1 nor the V2 settle CAS had any production caller: webhook reconciliation (`reconcileWebhookOrder` in `src/integrations/nautt/owner-pricing-orders.ts`) only persists `provider_order` status/version. 9.2.1 wired **only the V2 path** (a provider order attached to `order_v2_id` now invokes `orderV2Service.settle` after the authoritative owner-bound GET reconciliation).

**Gap:** V1 `payment_link_order` rows never transition through the settlement map V1 in production. A confirmed provider payment leaves the V1 order `PENDING` forever, and a `SINGLE_USE` V1 link is never consumed by the atomic claim — the V1 settle service (`src/orders/payment-link-order.ts`) is exercised only by tests.

**Candidate resolution (separate modification, not scoped into 9.2.1):** mirror the delivered V2 wiring for the V1 attach column (`provider_order.payment_link_order_id`) — invoke the V1 settle with exact persisted identities/versions after the same authoritative reconciliation, preserving the single-use claim-before-`CONFIRMED` semantics and the no-retry/no-second-GET fences. Needs its own card, plan, and disposable-PostgreSQL evidence; any V1 behavior change outside an approved task is forbidden.
