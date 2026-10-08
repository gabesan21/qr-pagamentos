---
parent: D-20261008-order-cancellation-status
task: D-20261008-order-cancellation-status.03-ui-and-contracts
created: 2026-10-08
---

# UI presentation and contract synchronization

- Renamed `CompactProviderStateBadge` to `CompactOrderStatusBadge` (`src/app/orders/order-badges.tsx`).
- Render single authoritative status badge across owner orders, link drilldowns, admin orders, associated orders card, detail chronology, and dashboards.
- Contradictory provider status timeline entry omitted on cancelled orders; audit history preserved.
- Updated bilingual dictionaries, `DESIGN.md`, and lifecycle/admin/frontend specs.
- [[src/app/orders/order-badges.tsx|order-badges.tsx]] · [[pop/specs/checkout-and-order-lifecycle.md|checkout-and-order-lifecycle.md]].
