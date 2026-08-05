# F04 — i18n and tests

- **Entrega:** Bilingual dashboard labels added and tests updated for the new markup.
- **Escopo:** Add missing `merchantDashboard*` keys to `src/i18n/dictionaries/merchant-dashboard/en.ts` and `pt-BR.ts` (title, greeting, view store, view all, empty states, banners). Update `src/app/(merchant)/page.test.tsx` to assert the period tablist, conditional view-store link, preserved notices, currency formatting, and empty states. Optionally add `dashboard.test.tsx` for formatter tests. Remove obsolete assertions only after confirming the old markup is gone.
- **Owns:** `src/i18n/dictionaries/merchant-dashboard/*`, `src/app/(merchant)/page.test.tsx`.
- **May read:** `src/i18n/dictionaries/admin-dashboard/*` for naming precedent, template fixture strings.
- **Must not edit:** business services, non-merchant dictionaries.
- **Depends on:** F02.
- **Skills:** clean-code-change.
- **Critérios:** C3, C5, C7.
