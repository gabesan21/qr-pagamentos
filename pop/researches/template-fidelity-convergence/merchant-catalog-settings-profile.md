# Template fidelity audit — catalog, settings, profile

- **Date:** 2026-09-07 · **Method:** read-only comparison of `docs/template/app/src/pages/{catalog,settings,profile}/*` against `src/app/(merchant)/{catalog,settings,profile}/**` and their form components (no browser run).
- **Overview:** [[researches/template-fidelity-convergence/template-fidelity-audit|Template fidelity audit]] — read first for the cross-cutting causes.
- **Functional authority:** `docs/template/info.md` › "Products Directory" … "Profile and Security".

## Cross-cutting facts

- `@theme inline` (`src/app/globals.css:1130-1163`) maps only shadcn tokens; pages mix them with BEM (`settings-surface__*`, `storefront-workspace*`, `profile-workspace*`).
- Zero toast usage; every outcome is a redirect plus a query-string `Alert` banner. Several banners render **twice** (Nautt: `settings-surface.tsx:71` + `nautt-credential-surface.tsx:114`; TOTP: `profile-management.tsx:61` + `totp-section.tsx:184`).
- All mutations are plain `<form method="post">` with full reload. Client enhancement only for image staging (`fetch /products/images`), TOTP enroll/regenerate (`fetch` JSON), pending spinners and dirty-field omission.
- `WorkspaceHeading` adds an eyebrow/description block the template does not have.

## Per-page fidelity

| Page | Fidelity | Main gaps (evidence) |
|---|---|---|
| `/catalog` | medium | Apply/Reset toolbar; `canonicalFilterQuery` never passed so **chips never render** (`catalog/page.tsx:180-233`); no pagination — rows truncated to `pageSize` with a sentence (`:175-177,234`); sizes 25/50/100 vs 10/25/50; archived badge painted `danger` (template neutral, `:73`); icon empty state, not `/empty-products.svg`; fallback image is a brand mark, not `/product-fallback.svg`; price has no pair line. |
| `/catalog/products/new` | low-medium | Card-in-card: outer `SectionCard` + four inner cards (`product-form.tsx:223,285,311,352`); **two "Create product" submit buttons** (`new/page.tsx:45` + `product-form.tsx:368`); no active/inactive control on create (`:338`); default currency not pre-selected (`:83-84`); no client validation; **server failure redirects to `/catalog?products=failed` and discards typed data** (`products/route.ts:41`); image field has no drag-and-drop; preview never shows selected currency; no `loading.tsx`. |
| `/catalog/products/[id]` | low | **Archive and Activate/Deactivate confirm dialogs do nothing**: `requestSubmit()` on refs never attached (`product-detail-client.tsx:119-120,205,217` vs `:74,:94`); archived products **hide the form entirely** (`:157`) contradicting "remain available for historical reference"; conflicts redirect to the list; Save always enabled; remove-image has no confirm; name rendered twice (heading + `WorkspaceHeading`); sr-only forms add stray focusable buttons. |
| `/catalog/categories` | medium | Inline create uses raw `<label>/<input>`; failure redirect drops values; edit inputs render inside the actions cell (`category-row-actions.tsx:47-82`); **inactive categories have no actions** (`categories/page.tsx:163-171`); blocked-deactivation banner inside a table cell (`:89-92`); `closeLabel` passes `dataDirectoryResetFilters` (`:129`); referencing count does not exclude archived; no chips, no pagination. |
| `/settings` | low | **No CSS defines any `settings-surface__*` class** → nav is a flat link list, no two-column sticky layout, no scroll-spy (`settings-surface.tsx:64-100`); each section heading rendered **twice** (`:101-115` + `storefront-settings-management.tsx:144-147`); **saving storefront, checkout policy or language redirects to `/`** (`storefront/route.ts:39`, `checkout-policy/route.ts:15`, `language-preference/route.ts:18`); Nautt lacks Validate and Replace-when-active, reset without confirm (`nautt-credential-surface.tsx:152-224`); policy is a 5-option select (extra `EMAIL`) not four radio cards; theme/layout native selects, no swatches; accent text input only; logo is a bare file input in a separate reload form (`/storefront/logo`); store-enabled checkbox in the Payments card without confirm; no default-currency Clear button; page description uses `adminLanguageDescription` (`settings/page.tsx:41`). |
| `/profile` | medium-low | `.profile-workspace__cards` is `auto-fit` so cards may sit side by side (`globals.css:1250`); identity Save always enabled, no inline validation; **password change redirects to `/login`** (`profile/password/route.ts:22`); TOTP enrollment **reversed** (codes first, then QR + current password + OTP as native form reload, `totp-section.tsx:243-294`), no manual secret CopyField, no Download, no inline wrong-code error; **regenerate has no confirmation** (`:141-155`); regenerated-codes modal lacks the unsaved guard; no enrolled-since date. |

## Native POST targets (all full reload)

`/products`, `/product-categories`, `/nautt-credentials[/register|/reset]`, `/checkout-policy` (→ `/`), `/storefront` (→ `/`), `/storefront/logo`, `/language-preference` (→ `/`), `/profile/identity`, `/profile/password` (→ `/login`), `/profile/totp/confirm|disable`. Client `fetch`: `/products/images`, `/profile/totp/enroll|regenerate`.

## Top divergences by user impact

1. Product archive and activate/deactivate unreachable from the UI (detached refs).
2. Settings saves navigate to the dashboard, abandoning `/settings`.
3. Settings two-column sticky nav unstyled; headings duplicated.
4. Product/category failures discard typed input.
5. Archived product detail hides the data.
6. TOTP flow restructured; no secret/download; no regenerate confirmation.
7. No toasts; duplicated banners.
8. Store configuration controls are native selects/text/file inputs.
9. Directory toolbar model: Apply/Reset, no chips, no pagination, icon empties.
10. Nautt connection lacks Validate/Replace; policy exposes extra `EMAIL` as a select.

UNVERIFIED: server-side guard against enabling a storefront without slug/names.
