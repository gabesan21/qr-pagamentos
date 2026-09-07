# Template fidelity audit — merchant dashboard, orders, payment links

- **Date:** 2026-09-07 · **Method:** read-only comparison of `docs/template/app/src/pages/{merchant,links}/*` against `src/app/(merchant)/{page,dashboard,orders,links}/**` and `src/app/orders/*` (no browser run).
- **Overview:** [[researches/template-fidelity-convergence/template-fidelity-audit|Template fidelity audit]] — read first for the cross-cutting causes.
- **Functional authority:** `docs/template/info.md` › "Merchant / Customer-Management Area".

## Cross-cutting facts

- Template utilities (`rounded-card shadow-card bg-surface text-text-2 font-display font-money`) appear only in `src/app/not-found.tsx`; merchant pages use shadcn tokens plus BEM (`merchant-dashboard__*`, `workspace-heading`).
- `DataDirectory` is a server GET form with labelled fields, **Apply/Reset buttons**, cursor prev/next only, no row click; `src/data-directory/AGENTS.md` forbids a parallel `DataTable`/`FilterBar`/total-count owner.
- Post-mutation redirects go to the **directory** (`/orders?orders-v2=…`, `/links?payment-links-v2=…`), never back to the detail (`orders-v2/[id]/route.ts:27-31`, `payment-links-v2/[id]/route.ts:36-40`); no toast in the merchant area.
- No `loading.tsx` on any detail route; links-family unavailable states are destructive `Alert`s, orders-family uses `EmptyState` (inconsistent).
- Invalid query params → destructive `invalid-query` card or 307 redirect (template: ignore + info toast).

## Per-page fidelity

| Page | Fidelity | Main gaps (evidence) |
|---|---|---|
| `/` dashboard | medium-low | Period control is bordered `<Link>`s with round-trip (`dashboard.tsx:71-94`); no storefront-disabled banner; no first-run empty state; no error/stale/retry strip; stat 1 is "Checkout attempts" without LINK/STANDALONE/AD_HOC caption; **chart card "By state / By source" missing** (view model lacks `byProviderState`/`byOrigin`, `merchant-analytics.ts:80-88`); inventory row has 2 cards, not 4 (no total links, active/archived products); recent orders and leading products are non-clickable (no ids in view model); recent rows show description not `#id · payer`; single combined badge instead of provider + outcome. |
| `/orders` | medium-low | Missing provider-state and local-outcome filters; "Money: USD/Fiat" instead of currency pair; link filter free text (`orders/page.tsx:128-187`); page sizes 10/20/50/100; no row click; prev/next only; icon empty state; legacy V1 list bolted below a separator (`:235-242`). |
| `/orders/[id]` (V1) | medium | Summary lacks source; no payment-data card; related link is identifier only; no `loading.tsx`; extra `WorkspaceHeading`. |
| `/orders/v2/[id]` | low-medium | Local-outcome editor is two `<details>` forms (finalize/cancel) with no dialog and no gating on `confirmed`; vocabulary differs from template in-progress/finalized (`order-v2-views.tsx:435-509`); comments are oldest-first `<article>`s with an extra edit form, no Monogram composer, `Timeline` used for a separate chronology card; line column shows `line.position` not title (`:259`); submit redirects to `/orders`. |
| `/links` | medium-low | Missing era, currency, from/to filters and the **currency column** (`links/page.tsx:70-106,138-175`); legacy links rendered via the admin `OwnerPaymentLinkManagement` create/revoke form instead of merged rows + read-only modal (`:246-252`). |
| `/links/new` | low | Composition/type as `NativeSelect` not radio cards; product lines: select + number, **no search, no prices, no running total**; localized descriptions **only for FIXED_AMOUNT** (`link-v2-form.tsx:80-103`); no expiration clear; no sticky live preview; no locked-field notes in new-version mode; failure redirects to `/links` and **drops the form input** (`payment-links-v2/route.ts:26`). |
| `/links/v2/[id]` | medium | Action row below the cards; activate/deactivate driven by `active` only — no paid-single-use/expired-reusable guards or captions (`link-v2-actions.tsx:15-73`); orders summary **hardcoded** `confirmed: 0, volume: "0.00"` (`v2/[id]/page.tsx:43`); subtotal via float `Number()` (`link-v2-views.tsx:189-192`); no unavailable-product badge. |
| `/links/v2/[id]/edit` | low | Lock/new-version banners shown unconditionally; structural fields not rendered at all (`link-v2-form.tsx:170`); lines editor never `disabled`; conflict collapses into generic `failed` on `/links`; no live preview. |
| `/links/v2/[id]/orders` | medium | No 3-level breadcrumb; identifier plain not CopyField; order column shows description not payer; generic `Badge` not `StatusBadge`. |
| `/links/v2/[id]/orders/[orderId]` | medium-high | No 4-level breadcrumb; absent payer facts omitted rather than labelled; float math (`:123`); Alert unavailable. |

## Top divergences by user impact

1. Every list is a GET form with Apply/Reset and prev/next cursors; no instant filtering, page numbers, totals or row click.
2. Create/Edit link is a plain stacked form: no radio cards, product search, steppers, prices, total, preview, inline errors; failure drops input.
3. Post-mutation redirects to directories; no success toasts.
4. Dashboard chart content differs; inventory row incomplete; stat 1 semantics differ.
5. Dashboard rows are dead (no ids exposed by the analytics view model).
6. Orders directory lacks provider-state/local-outcome filters; money filter replaces currency pair.
7. Local-outcome editor structure, gating and vocabulary differ.
8. Legacy sections bolted below `/orders` and `/links` (the latter reusing the admin form).
9. Link lifecycle rules absent in UI; orders summary hardcoded.
10. Missing dashboard states: storefront banner, first-run, error/stale/retry.
