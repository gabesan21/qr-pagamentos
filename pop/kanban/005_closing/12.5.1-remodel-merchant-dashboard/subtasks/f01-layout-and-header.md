# F01 — Layout and header

- **Entrega:** `src/app/(merchant)/page.tsx` header matches the template dashboard header.
- **Escopo:** Replace the current `WorkspaceHeading + DashboardPeriodNavigation` layout with a template-style header: title, greeting, conditional view-store button, and period tablist. Keep `requireMerchantShellContext`, `readDashboardView` period fallback (`DEFAULT_PERIOD`, invalid → `7d`), storefront-link gating (`storefrontEnabled && slug`), and existing notice `Alert` handling. Use server-rendered `Link` for period links and the view-store button.
- **Owns:** `src/app/(merchant)/page.tsx`.
- **May read:** `src/app/admin/page.tsx` for the admin header pattern, `docs/template/app/src/pages/merchant/MerchantDashboard.tsx` for reference composition.
- **Must not edit:** `src/app/(merchant)/shell-context.ts`, `src/app/(merchant)/dashboard.tsx`, `src/orders/merchant-analytics.ts`, authorization code.
- **Depends on:** none.
- **Skills:** clean-code-change, ui-change.
- **Critérios:** C1, C3, C6.
