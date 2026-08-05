# F02 — Dashboard composition

- **Entrega:** `dashboard.tsx` rebuilt on the shared UI inventory while preserving existing analytics.
- **Escopo:** Compose four template rows:
  1. Key-stats grid (StatCard): checkout attempts, confirmed sales, locally finalized sales, conversion rate — derived from existing `MerchantAnalyticsView` fields.
  2. Funnel card with CSS-only progress bars for converted, in-progress, and abandoned.
  3. Inventory stats grid (StatCard): active links and other available counts.
  4. Leading products and recent activity cards.
  Use `MoneyText` for amounts, `EmptyState` for empty data, `StatusBadge`/`Badge` for states. Keep `formatDashboardRate`, exact-decimal formatting, and unlabeled-currency treatment. Copy the progress-bar bucket helper locally (admin-dashboard pattern) to keep the merchant module self-contained.
- **Owns:** `src/app/(merchant)/dashboard.tsx`.
- **May read:** `src/app/admin/dashboard.tsx` for StatCard/MoneyText patterns, `src/orders/merchant-analytics.ts` for available fields.
- **Must not edit:** `src/orders/merchant-analytics.ts`, `src/app/(merchant)/catalog/price-format.ts` semantics.
- **Depends on:** F01.
- **Skills:** clean-code-change, ui-change.
- **Critérios:** C2, C3, C5, C6.
