# Template fidelity audit — public checkout, storefront, shared inventory

- **Date:** 2026-09-07 · **Method:** read-only comparison of `docs/template/app/src/pages/checkout/CheckoutPage.tsx` and `docs/template/app/src/components/ui/*` against `src/app/pay/**`, `src/app/store/**`, `src/components/ui/**`, `src/data-directory/ui/**`, `src/app/globals.css` (no browser run).
- **Overview:** [[researches/template-fidelity-convergence/template-fidelity-audit|Template fidelity audit]] — read first for the cross-cutting causes.
- **Functional authority:** `docs/template/info.md` › "Public Payment Link".

## Part A — `/pay/[identifier]`, `/store/[slug]`, `/store/[slug]/pay`

| Route | Score | Rationale |
|---|---|---|
| `/pay` V1 | 4/10 | Mechanics complete (policy forms, idempotent retry, polling) but no merchant header, no theme, no currency label, no expiry, generic validation, form never yields to payment phase, 8 states collapse to a badge, no success/terminal views, no footer/privacy modal. |
| `/pay` V2 | 5/10 | Adds branded rail, header, currency, lines, paid view; same payment-phase deficits; 1280px two-column (`globals.css:1263`, `public-checkout-v2-page.tsx:81`) vs template 560px single column; lines as three stacked `<p>` not one row. |
| `/store/[slug]` | 5/10 | Same tokens/owners and theme-preview mechanism; hand-rolled BEM (`storefront-*`, 21 classes) with a `receipt-rail` header distinct from `checkout-v2__rail`; no Monogram, no StatusBadge, no footer. |
| `/store/[slug]/pay` | 4/10 | Inherits every V1 deficit; unavailable is `Card`+`Alert` (storefront uses `EmptyState`); `REFUNDED` toned `danger` (V1/V2 neutral); submit not `lg`. |

Key element gaps (evidence):
- **Outcome states are one badge line** — confirmed/rejected/cancelled/expired/refunded show only `StatusBadge`; no success illustration, order reference, payer/merchant recap, terminal copy or "New payment" (template `CheckoutPage.tsx:604-735` vs `public-checkout-form.tsx:317-362`).
- **Form never yields to payment phase and editing resets the attempt** (`public-checkout-form.tsx:194-198` wipes attempt/payment/capability on change) — a buyer can lose an issued QR.
- **V1 has no merchant identity or theme** (`pay/[identifier]/page.tsx:29-40`; DTO `public-checkout-presentation.ts:9-12`).
- Validation is required-only with one generic message; no e-mail/CPF/CEP format, masks, `inputMode`, scroll-to-error (`:102-117`).
- No expiry countdown or single-use badge anywhere.
- Submit label never shows the amount; retry appears only after 3 polling failures (template immediately).
- QR: provider `<img>` in `bg-card` frame (dark themes may frame the QR dark — UNVERIFIED), `identity` slot unused, CopyField is a full outline button, copy feedback duplicated.
- Privacy is one static sentence (no link/modal); no footer, powered-by or language switcher — anonymous buyers locked to `defaultLocale` (`page.tsx:19`).
- Tone drift: PENDING=warning (template info); SA REFUNDED=danger.
- Production adds an `EMAIL`-only policy the template lacks (superset).

## Part B — shared component inventory (`src/components/ui/inventory.json`)

| Template component | Production owner | Parity | Divergence |
|---|---|---|---|
| StatCard | `stat-card.tsx` | partial | No sparkline; value `font-mono` not display; no entrance motion. |
| Modal / ConfirmDialog | `modal.tsx` | full (API renamed) | Superset: pending/failure retention, typed confirmation. |
| FilterBar | inside `data-directory-client.tsx` | partial | GET form, Apply/Reset, `Badge` chips; not standalone. |
| SimpleTabs | `simple-tabs.tsx` | partial | No sliding indicator. |
| ImageUploader | **none** | missing | Native `<input type="file">` in catalog and storefront settings. |
| MoneyText | `money-text.tsx` | partial | Pre-formatted string; pair as `Badge`, no "/ PIX" suffix. |
| EmptyState | `empty-state.tsx` | full+ | Same illustrations, adds `kind`. |
| CopyField | `copy-field.tsx` | partial | Full outline button vs compact mono chip; no `execCommand` fallback. |
| Timeline | `timeline.tsx` | partial | 32px icon circles vs continuous rule + dots. |
| Monogram | `monogram.tsx` | partial | No 48px size; `bg-muted` not accent-soft; unused on public routes. |
| LocalizedFieldGroup | `localized-field-group.tsx` | partial | Tabs under the label, no completeness dot. |
| DataTable | `data-directory*.tsx` | partial | No row click, sticky header, page numbers, "x–y of total". |
| Skeletons | `skeletons.tsx` | full | |
| StatusBadge family | `status-badge.tsx` | partial | Generic only — no Provider/LocalOutcome/LinkLifecycle/AccountState/EntityState badges; solid fills vs soft tints + dot; tone re-derived per caller. |
| Toast | `toast.tsx` (sonner) | full, **0 call sites** | Only `design-system` and tests use it. |
| QRDisplay | `qr-display.tsx` | partial | No QR generation (`qrcode` dep unused here); `identity` unused; `bg-card` not white. |

## Token wiring (`src/app/globals.css:1130-1165`)

`@theme inline` exposes only shadcn names. Not defined: `--color-surface/-2`, `--color-text-2/3`, `--color-bg`, `--color-accent-fg`, `--color-danger/info(-soft)`, `--radius-card/pill`, `--shadow-card`, `--font-display`, `--container-app/checkout`. Consequences: `bg-surface`, `text-text-2`, `rounded-card`, `shadow-card` are **dead classes** (only `not-found.tsx` uses them); `font-display` reachable only via `font-[family-name:var(--font-display)]`; `font-money`/`rounded-pill`/`max-w-app`/`max-w-checkout` have no utility. Pages are styled through ~250 lines of route-scoped BEM in `globals.css:1178-1428` (`.checkout-*`, `.storefront-*`, `.receipt-rail*`, `.admin-*`, `.auth-*`) — 55 BEM classNames in `admin/dashboard.tsx`, 34 in `shell-navigation.tsx`, 21 in `storefront-experience.tsx`.

## Top divergences by user impact

1. Eight outcome states reduced to one badge; no success/terminal views.
2. Form never yields to payment phase; keystroke wipes the QR.
3. V1 checkout unbranded and unthemed.
4. Required-only validation.
5. No expiry countdown / single-use badge.
6. Template tokens not wired into Tailwind 4; dead classes; BEM everywhere.
7. V2 checkout 1280px two-column vs 560px.
8. StatusBadge generic with drifting tones.
9. QR presentation (frame, monogram, chip).
10. Public furniture missing: footer, privacy modal, language switcher.
