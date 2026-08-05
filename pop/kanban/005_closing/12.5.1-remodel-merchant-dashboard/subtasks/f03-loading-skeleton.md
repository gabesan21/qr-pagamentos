# F03 — Loading skeleton

- **Entrega:** `src/app/(merchant)/loading.tsx` mirrors the template skeleton composition.
- **Escopo:** Replace the current custom skeleton with `StatGridSkeleton` and `CardSkeleton` arranged in the same row order as the dashboard (stats, funnel, inventory stats, leading products + recent orders). Keep the `aria-busy="true"` and `role="status"` wrappers.
- **Owns:** `src/app/(merchant)/loading.tsx`.
- **May read:** `src/components/ui/skeletons.tsx`, `docs/template/app/src/pages/merchant/MerchantDashboard.tsx`.
- **Must not edit:** any other file.
- **Depends on:** none.
- **Skills:** ui-change.
- **Critérios:** C4.
