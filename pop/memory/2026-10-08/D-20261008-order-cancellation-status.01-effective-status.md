---
parent: D-20261008-order-cancellation-status
task: D-20261008-order-cancellation-status.01-effective-status
created: 2026-10-08
---

# Unified store order status resolution

- Added `resolveOrderV2StoreStatus` helper in `src/orders/order-v2-status.ts`.
- `OrderV2Summary` in `src/orders/order-v2-view.ts` exposes `storeStatus` derived from payment state and latest outcome (`created_at DESC, id DESC`). Raw state is retained on `StoredOrderV2View` and omitted from summary spread.
- Checkout status and replay services in `src/checkout/` return terminal `CANCELLED` without `pixCopyPaste` when latest outcome is `LOCAL_CANCELLED`.
- [[src/orders/order-v2-status.ts|order-v2-status.ts]] · [[src/orders/order-v2-view.ts|order-v2-view.ts]].
