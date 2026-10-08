---
parent: D-20261008-order-cancellation-status
task: D-20261008-order-cancellation-status.02-directories-and-analytics
created: 2026-10-08
---

# Status filtering and analytics grouping

- `src/orders/order-v2-directory.ts` and `src/orders/order-v2-admin-directory.ts`: status filters execute via parameterized SQL with `LEFT JOIN LATERAL` on latest outcome, resolving `LOCAL_CANCELLED` to `CANCELLED` before pagination and seek constraints.
- `src/orders/merchant-analytics.ts` and `src/orders/admin-analytics.ts`: raw `state` groupBy replaced by single parameterized query resolving effective status once per order. Renamed `byProviderState` and `byState` to `byStatus`.
- [[src/orders/order-v2-directory.ts|order-v2-directory.ts]] · [[src/orders/admin-analytics.ts|admin-analytics.ts]].
