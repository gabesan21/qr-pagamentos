# Template fidelity audit — administrator area

- **Date:** 2026-09-07 · **Method:** read-only comparison of `docs/template/app/src/pages/admin/*` against `src/app/admin/**` (no browser run).
- **Overview:** [[researches/template-fidelity-convergence/template-fidelity-audit|Template fidelity audit]] — read first for the cross-cutting causes.
- **Functional authority:** `docs/template/info.md` › "Administrator Area".

## Cross-cutting facts

- No template utility vocabulary (`bg-surface`, `text-text-2`, `rounded-card`, `shadow-card`, `font-display`) in the admin tree; pages use shadcn tokens plus BEM classes (`.admin-dashboard__*`, `.admin-account__*` in `src/app/globals.css`).
- Every filter/page/period change is a GET form submit or `<Link>` → full server round-trip; no toast provider mounted; feedback is `?success=|?error=` → page-top `Alert`.
- `AdminDashboardSkeleton` (`dashboard.tsx:498`) is defined but never rendered; `DataDirectory` `loading` state is never passed by admin pages.
- Positive divergence: `DataDirectory` renders `<dl>` fact cards below `md`, richer than the template's scroll table.

## Per-page fidelity

| Page | Fidelity | Main gaps (evidence) |
|---|---|---|
| `/admin` | medium | Period control is three link pills with full navigation (`dashboard.tsx:72-85`); grid classes `admin-dashboard__col--5/4/3` undefined in CSS so the 5/4/3 split is lost (`dashboard.tsx:529-539`); no active-users delta chip; top merchants link to `/admin/accounts` instead of merchant-filtered orders (`:435`); no error+retry strip; no per-card skeletons. |
| `/admin/orders` | medium-low | Missing filters: provider state, local outcome, merchant (`order-v2-admin-directory.ts:50-56`); source offers only LINK/AD_HOC (`orders/page.tsx:148-151`); pair filter replaced by USD/FIAT money buckets; link filter is free text; prev/next only, no page numbers/total; chips show raw enum values; V1 orders rendered as a separate legacy `<dl>` list (`order-views.tsx:65-91`). |
| `/admin/orders/[id]`, `/v2/[id]` | high (V2) / medium (V1) | Link card lacks lifecycle badge and link to link detail (`order-v2-views.tsx:328-341`); line column shows `line.position` not product title (`:259`); no `loading.tsx`; redundant `WorkspaceHeading` above breadcrumb. |
| `/admin/payment-links` | medium-low | Missing identifier CopyField, amount/"N products" and created columns (`payment-links/page.tsx:80-92`); missing merchant and currency-pair filters; type is plain text; icon empty state instead of illustration. |
| `/admin/payment-links/v2/[id]` | medium | **Broken drill-down:** "View orders" emits `/admin/orders?link=` but the grammar only accepts `filter.<name>` (`page.tsx:37`, `query-contract.ts:173-174`) → invalid-query card; associated-orders list missing (`orders` prop not passed); public URL hidden (`showShareUrl={false}`); subtotal via float `Number()` (`link-v2-views.tsx:189-192`); unavailable is a destructive Alert, not illustration. |
| `/admin/accounts` | medium-low | Create is an always-visible inline form, no modal, no initial status, no password generator/strength/copy (`admin-surface.tsx:48-93`); row **Delete POSTs with no confirmation** (`accounts/page.tsx:119-123`); slug not shown in store column; no relative "N days ago"; no row click; no empty CTA. |
| `/admin/accounts/[id]` | medium-low | Stacked cards + anchors instead of `SimpleTabs`; role/status/policy/theme/layout/language are native selects (template: segmented, card grid, swatch grid); **soft delete and TOTP disable POST without confirmation** (`[id]/page.tsx:494-498`, `:304-308`) although `ConfirmDialog` supports typed confirmation; password flow differs (direct set + email link vs temp-password modal); facts card always rendered; no deleted banner. |
| `/admin/settings` | medium | Anchor nav without scroll-spy (`settings-surface.tsx:70-81`); **§4 Global payments is inert** — switches and Save disabled (`payment-settings-section.tsx:26-38`); §1 hides Nautt UUIDs and never lists inactive mappings (`exchange-currencies-section.tsx:92-107`); no per-section success banner; language requires explicit Save; `toLocaleDateString()` without locale (`catalog-records-section.tsx:106`). |

## Top divergences by user impact

1. Dead drill-down link detail → orders (`?link=` vs `filter.link`).
2. Destructive actions without confirmation: row delete, account soft delete, TOTP disable.
3. Orders directory lacks provider-state, local-outcome and merchant filters; incomplete source options.
4. Global payment settings section non-functional.
5. Account editor: stacked cards + native selects instead of tabs, segmented controls, card grid, swatches.
6. Account creation: inline form instead of modal with status/generator/strength/copy.
7. No client interactivity or feedback layer: round-trips, Apply button, no toasts, unused skeletons.
8. Payment-links directory missing identifier/amount/created columns and two filters.
9. Dashboard period control, lost 5/4/3 spans, missing delta, wrong top-merchant link.
10. Parallel BEM styling and legacy V1 `<dl>` list outside the directory.

## Secondary notes

- Exchange-currency status hard-coded "Active"; Replace/Reactivate flows are production extras.
- Order detail payer card lacks the "not required by policy" hint.
- Pairs/methods add-form requires UUIDs and shows UUID CopyFields per row (template shows name/created/status only).
