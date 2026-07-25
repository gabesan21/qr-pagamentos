# QR Pagamentos design system

## Tone

**PIX settlement desk** is a precise, role-neutral operational workspace for a
Brazilian payment product. Its references are a PIX receipt (*comprovante*), QR
alignment grid, cashier terminal, and clearing ledger: strong status hierarchy,
compact labelled facts, ruled separation, and one trustworthy action at a time.
The receipt rail aligned to a subtle QR-module rhythm is the signature element.

Do not use gradients, purple or neon-acid accents, generic three-card
dashboards, decorative charts, rounded-everything surfaces, remote fonts, or
color-only status communication.

## Token contract

`src/design-system/tokens/themes.tokens.json` is the canonical DTCG-shaped
reference and semantic color graph. `src/design-system/tokens/resolver.json`
fixes resolution order, while `scripts/generate-design-tokens.mjs` projects the
graph deterministically into the generated block in `src/app/globals.css`.
Components consume semantic custom properties exclusively; `pnpm tokens:check`
and token lint reject projection drift and raw authored visual values. Each
theme block is projected twice from the same resolution: the page-level
`:root[data-theme="…"]` selector and the scoped `[data-theme-preview="…"]`
selector, which recolors one container (the storefront settings preview)
without changing the page theme. Custom-property aliases resolve where they
are declared, so each scoped block also re-declares the color alias layers
(semantic and Tailwind `@theme` color maps) to recolor owned primitives inside
the preview; a contract test pins that alias layer to the `globals.css`
originals.

| Identifier | Mode | Personality |
| --- | --- | --- |
| `pix-paper` | light, default light | crisp receipt paper, graphite facts, PIX teal |
| `cashier-daylight` | light | cool terminal white, deep blue controls, cyan-green confirmation |
| `settlement-sand` | light | warm reconciliation paper, umber facts, restrained green action |
| `midnight-clearing` | dark, default dark | graphite clearing desk, pale facts, mint action |
| `vault-blue` | dark | deep navy custody surface, ice-blue facts, cyan action |
| `terminal-amber` | dark | near-black terminal, warm amber facts, muted green confirmation |

An explicit valid `data-theme` wins. Without one, light resolves to `pix-paper`
and dark system preference to `midnight-clearing`; `.light` and `.dark` retain
those legacy defaults. An unknown identifier inherits the safe `pix-paper`
root. Selection persistence and role-specific themes are outside this contract.

| Group | Semantic tokens |
| --- | --- |
| Surface | `--surface-page`, `--surface-raised`, `--surface-subtle`, `--border-subtle` |
| Text | `--text-primary`, `--text-secondary`, `--text-on-action` |
| Action | `--action-primary`, `--action-primary-hover`, `--action-secondary` |
| Feedback | `--feedback-success`, `--feedback-warning`, `--feedback-danger` and matching `--text-on-*` tokens |
| Layout | `--space-*`, `--radius-*`, `--shadow-raised`, `--type-*`, `--focus-*` |

The locally bundled type stack is `IBM Plex Sans Variable`, `IBM Plex Sans`,
then `sans-serif`; factual values use `font-variant-numeric: tabular-nums`. Spacing follows the token scale from
compact labelled facts to section separation. Text prose is at most `65ch`;
there is at most one primary action per section, and labels sit above inputs.

## Accessibility evidence

The deterministic token test derives WCAG sRGB relative luminance from every
theme's required fallback. Primary, action, success, warning, and danger text
must reach **4.5:1**; focus against the page must reach **3:1**. Every OKLCH
token must carry a six-digit in-gamut sRGB fallback. Full motion resolves to
180ms with the shared easing curve; reduced motion resolves the duration to
zero and removes non-essential transitions and animation.

## Official identity

The original **settlement mark** turns the receipt rail and QR alignment rhythm
into ten open, non-scannable modules. `src/brand/geometry.ts` is its only
canonical geometry. The closed family is mark-only, product lockup, compact
role-shell lockup, and merchant fallback; every lockup uses the exact visible
name `QR Pagamentos` in the licensed IBM Plex Sans family. Static lockups embed
the reviewed `src/brand/wordmark.outlines.svg` paths and never depend on a live
host, local, or remote font.

Inline identities use `currentColor` from `--text-primary`, so identical
geometry serves all six themes. The fixed positive and reversed SVG exports are
only for static contexts that cannot inherit semantic color. Keep clear space
equal to one-sixth of the mark width. Minimum rendered sizes are 16 CSS pixels
for the mark, 120 for the product lockup, and 112 for compact/fallback lockups.
The favicon uses its fixed high-contrast field at 16, 32, and 48 pixels.

When visible identity text accompanies the mark, the mark is decorative. A
standalone meaningful mark receives exactly one caller-supplied localized
accessible name and no SVG title. The merchant fallback identifies the product
only while no merchant image capability is available; it never claims that the
product mark belongs to the merchant. `pnpm brand:check` protects provenance,
safe SVG structure, hashes, inventory, dimensions, and generated derivatives.

## Primitive inventory and state matrix

Owned Radix/nova shadcn source lives in `src/components/ui/`. The following
deliberately small inventory is the only foundation introduced:

| Primitive | Purpose | States |
| --- | --- | --- |
| `Button`, `Field`/`Input`, `Textarea`, `NativeSelect`, `Checkbox` | current action and native form controls, including multiline descriptions | default, populated, loading where applicable, disabled, invalid, hover/focus; empty is not applicable to a control |
| `Card`, `Alert`, `Badge`, `Separator`, `Skeleton`, `Table`, `Spinner` | grouped content, feedback, loading, and facts | documented default, empty/error/recovery, or loading state as applicable |

The reusable data-directory composition deliberately adds no owned primitive:
official `Empty` and `Pagination` registry preflight was attempted with the
pinned shadcn `4.13.0` CLI, but registry DNS was unavailable. Existing `Card`,
`Alert`, `Button` links, `FieldGroup`/`Field`, inputs, selects, skeletons,
separators, and `Table` satisfy the contract without source duplication.

Data directories have six closed states: ready, loading, empty, filtered-empty,
invalid-query, and error. One definition produces a captioned native table from
768 CSS pixels and ruled `dl` facts below it; CSS leaves one renderer and action
set in the accessibility tree. GET toolbars have labels above controls, one
primary submit, cursor-free native submissions, canonical reset/pagination
links, visible focus, and targets of at least 44 by 44 CSS pixels. Numeric facts
use tabular figures, and invalid/error states echo no submitted or internal
detail.

The merchant catalog workspace under `/catalog` composes that directory as a
**single-page** listing: owner catalogs are bounded, so no cursor URLs exist
and any cursor parameter is invalid input. Strict decoding reuses the
foundation's query contract with deterministic canonical `307` resets; the
selected page size caps the rendered rows and an explicit truncation note asks
for a narrower search instead of inventing pagination. The products directory
shows 48-pixel owner image thumbnails (`GET /media/[identifier]`) or the
official `mark-only` placeholder, a never-color-only active/inactive/archived
badge vocabulary, and edit/view row actions; `/catalog/products/new` and
`/catalog/products/[id]` carry one primary native submission per card, category
and currency `NativeSelect`s with dirty-field omission (an untouched optional
field posts nothing, so a stored currency never re-gates), and a disabled
currency select with a bilingual explanation whenever no mapping is available.
A stored but unmapped currency renders as a disabled factual row. Product
images stage through `POST /products/images` (bounded multipart, opaque
identifier, `no-store`) into a focused observation-only client boundary with a
STAGED preview via the owner-fenced media read; client hints mirror — never
replace — the server byte/type limits, and the no-image placeholder is the
official merchant fallback lockup in `currentColor`, never a page-local asset.
Archived products render a read-only factual view with the terminal
irreversibility explanation and no mutation control. `/catalog/categories`
adds the inline bilingual create card and per-row edit plus a
destructive-confirmation deactivation block whose replacement select mirrors
the service's atomic reassignment; a referenced category with no active
replacement explains the blocked deactivation instead of offering a submit,
and inactive rows stay listed, badge-marked, and edit-locked.

The merchant `/links` workspace composes the full data-directory contract —
canonical `307` resets, signed keyset cursor URLs, and page sizes 25/50/100 —
as the Commerce V2 payment-link directory above the untouched V1 management
section. Rows carry summary, composition-kind and type facts, the derived
never-color-only active/inactive/expired/paid `Badge` vocabulary, a tabular
expiry, the `/pay/[identifier]` share page link, and a read-only view action;
`/links/v2/[id]` renders the same ruled fact composition as the order detail,
including ordered product lines or the fixed amount, the share URL with an
observation-only copy button, and one opaque destructive-`Alert` unavailable
view for cross-owner, malformed, or missing identities. The management flows
delivered by 8.2.2 complete the workspace: a primary `/links/new` create
affordance whose form switches between the ordered product-lines editor (1–20
lines, 1–9,999 quantity, per-link uniqueness hinted by disabling chosen
products) and the fixed-amount members, posting the hidden `lines` JSON the
route parses; `/links/v2/[id]/edit` with the immutable kind/type/pair as
read-only facts, the bilingual attempt-lock explanation, the `/links/new?from=`
new-version affordance, and dirty-field omission so expiry and financial
members stay unnamed until a real change (an explicit blank posts the clearing
empty value); detail-page activate/deactivate behind native `details`
confirmation posting the prefilled version CAS; and the closed
created/edited/activated/deactivated/failed outcome banners extracted before
directory canonicalization, success as a status `Alert` and the opaque failure
as a destructive one.

The merchant `/` dashboard is the server-rendered owner home above the 8.4.1
analytics projection: a heading area holding at most one primary View Store
action — rendered only when the storefront is enabled with a slug and linking
the sessionless `/store/[slug]` — and a plain GET period switcher
(`today`/`7d`/`30d`, pinned default `7d`; absent, unknown, or service-rejected
values render the default). The current period is a non-link entry marked by
`aria-current`, stronger type, and an underline, never color alone. Ruled
ledger cards compose sales, the checkout funnel, best sellers, payment-link
metrics, and recent activity; provider-confirmed and locally finalized sales
render as separate ruled groups with one tabular per-currency line each and
are never summed or merged anywhere in the composition. There are no charts:
quantitative composition is ruled facts and captioned native tables, rates
render as exact-decimal localized percents with an explicit n/a on a zero
denominator, and an unlabeled currency pair renders an explicit localized
unlabeled treatment. Every section owns an explicit empty state (zero data is
not an error), and loading uses owned skeletons.

The deterministic `/design-system` exercise surface resolves its dictionary from
the same server preference contract as the authenticated shell and presents all
applicable states, including labelled default, populated, disabled, and invalid
`Textarea` controls. Its keyboard order follows the rendered controls from the
primary action through fields and recovery actions. Enabled controls use a visible
semantic focus outline or ring at least two pixels wide; disabled controls are not
focusable.

The specimen also exercises a bilingual, synthetic data directory without
importing either role's business service. It renders all six states and both
responsive semantics in every theme; its rows and URLs are fixtures only and
introduce no production business directory.

The `/admin` shell and authenticated home consume this inventory directly for
account creation, account mutations, global BRL/PIX payment settings, language
preference, notices, navigation, and logout. Ruled account sections replace the
wide action table at narrow widths. Empty, loading, recovery,
pending/disabled, success, error, and inline destructive-confirmation states are
explicit without page-local variants or compatibility sources.

The merchant Settings workspace owns the bilingual Nautt onboarding ledger and
every opaque mutation notice or manual balance retry returns there. Its password
input never echoes a submitted key; validation, pending/disabled,
setup-changed, provider-unavailable, `UNREGISTERED` completion, non-retryable
recovery, configured balance, and manual balance-retry states compose the same
`Card`, `Alert`, `Field`/`Input`, `Button`, and `Spinner` inventory. Wallet facts
use labelled, tabular rows, and ambiguous webhook states expose no action.
Native onboarding submissions are observed without intercepting navigation: the
active action immediately exposes localized spinner/`aria-busy` feedback, and a
shared scope disables the password input plus competing setup actions after the
first payload is formed so a second provider mutation cannot be dispatched.

The authenticated home also owns each account's product, payment-link,
checkout-data-policy, and storefront-settings ledger. These owner-only forms
reuse the same cards, fields, selects, checkboxes, alerts, buttons, separators,
badges, and spinners: they show
empty prerequisites, success/recovery notices, native pending/disabled actions,
and visible keyboard focus without creating a home-specific visual variant.
The merchant Settings workspace owns the bilingual storefront settings
composition: four sectioned cards (Identity, Appearance, Payments, Default
currency) posting one native workspace save to `/storefront`. The Appearance
section holds the six-theme `NativeSelect` (labels sourced from the
design-system theme-id export, never duplicated literals), the `boxed`/`table`
layout select, the accent `Input`, the logo block, and a live preview. The
preview is a miniature storefront mock scoped by `data-theme-preview` with a
header rail (staged/stored logo through `/media/[identifier]`, or the official
merchant-fallback lockup — never a page-local mark), one fixture product in the
boxed `Card` or `Table` arrangement, and one inert owned-`Button` sample action
that adds no tab stop. The upload posts multipart to `POST /storefront/logo`
and returns to a staged status line; remove is client-only and the explicit
empty hidden field clears on save. A focused client boundary only observes the
native `input`/`change`/`submit`/`formdata` events: it mirrors control values
into the preview, omits unchanged extended fields from the payload (the server
treats absent as unchanged), announces busy, and disables both forms after the
payload is formed. The default-currency select lists only the registry's
active redacted choices plus a clear option, and renders disabled with a
bilingual explanation when no mapping is active — a normal empty state, never
an error. Its states are populated/prefilled, loading skeletons, empty (no
logo, no currency mapping), opaque error alerts, staged success status, and
hover/focus/disabled from the owned primitives.
The storefront card composes labelled `Input` text controls and one horizontal
`Checkbox` enablement toggle; its save posts to `/storefront` and reports only
the shared opaque success/conflict alert.

The unauthenticated `/login` page consumes the same inventory as a single
restrained credential `Card`: `Field`/`Input` with labels above the native
controls, a destructive `Alert` for the generic invalid-credential recovery,
and a page-local submit control that renders the owned `Button` plus `Spinner`
by observing the associated native form's `submit` event. It never intercepts
or replaces the `/login/submit` POST. Its default, pending/disabled,
error/recovery, and hover/focus states all come from the owned primitives; it
introduces no page-specific variant, token, or adapter.

The sessionless `/pay/[identifier]` checkout uses the same receipt rail and
existing `Card`, `Field`/`Input`, `NativeSelect`, `Alert`, `Badge`, `Separator`,
`Button`, and `Spinner` inventory. The policy decides the only visible customer
fields; initial, local-validation, submitting/disabled, QR/copy, waiting,
status-recovery, terminal, and unavailable states remain explicit and use no
page-specific visual primitive or token. QR images carry alternative text and
copy/status feedback is announced politely.

The sessionless `/store/[slug]` storefront follows the same PIX-ledger rail and
uses the existing `Card`, `Alert`, `Button`, and `Skeleton` primitives. Its
applicable states are available products, loading skeleton, enabled-but-empty,
opaque unavailable/error, and visible hover/focus on the checkout action;
there is no disabled storefront action. The page may declare only the validated
`--storefront-accent` custom property at its root. Scoped CSS uses
`--action-primary` as the fallback, and `scripts/check-design-tokens.mjs`
accepts that exact declaration only in this route and the matching declaration
only in the settings `storefront-preview.tsx` preview container; no other
inline style or raw visual value is allowed.

The authenticated `/orders` owner ledger and the read-only `/admin/orders`
administrator ledger reuse the same receipt rail, `admin-navigation`, ruled
`admin-account` fact sections, `Badge` state vocabulary, and `Card`/`Alert`
empty and unavailable states. Order states reuse the checkout state labels;
the policy-exact customer snapshot renders as labelled facts. Cross-owner or
missing order identities render one opaque destructive-`Alert` unavailable
view with a single back action; no order surface owns a mutation control or
page-specific visual variant.

## Role shell composition

Administrator and merchant workspaces use separate server adapters and one
role-neutral visual frame. Each adapter resolves the exact active role and
persisted locale before rendering its children. The frame receives only inert
labels, links, identity, username, locale, and content; its focused client
boundary owns pathname matching and mobile disclosure only.

Each role has exactly five numbered navigation entries. Dashboard roots match
exactly, while a non-root item remains active only for its slash-delimited
descendants. The active entry combines `aria-current="page"`, stronger type,
surface change, and an inline rule so color is never the only cue.

Above 768 CSS pixels, a persistent ruled sidebar carries navigation, role facts,
and logout. At 768 and below, the sidebar leaves the accessibility tree and a
44-pixel-or-larger disclosure exposes the same five links plus logout. The two
copies are never simultaneously exposed. The content starts with a skip target,
remains ordered after navigation, and fits without horizontal overflow at 320
CSS pixels.

The administrator composition uses the official compact role-shell lockup; the
merchant composition uses the official fallback without implying merchant
ownership. The administrator dashboard and future-area scaffolds remain explicit empty
states with no invented metrics, tables, controls, or unapproved projection
calls; the delivered merchant dashboard composition is the single exception.
Existing controls remain in their owned route areas and keep their POST URLs.

The merchant principal block has one secondary `/profile` affordance outside
the numbered five-entry business map. The profile workspace uses two
independent `Card` compositions: identity and password security. Each has one
primary native submission, labels above inputs, suitable autocomplete,
opaque localized feedback, and a payload-preserving client pending scope that
only observes native submit/formdata events, announces progress, and disables
its form after the browser forms the payload.
Loading uses owned skeletons; an empty state is inapplicable because the page
requires a resolved active merchant.

## Evidence and composition

`pnpm design-system:evidence` builds production output and creates a fresh
run-bound manifest with all six themes at 320, 375, 768, and 1440 CSS pixels
(24 captures). It rejects external requests, serious/critical axe findings, overflow,
font drift, target/action/status/prose violations, and console failures.
The specimen includes every Nautt onboarding, balance, conflict, and recovery
state without runtime provider calls or a test-only production backdoor.
`pnpm design-system:evidence:verify` requires the exact review and hashes.

`pnpm login:evidence` and `pnpm login:evidence:verify` provide the same
run-bound contract for production `/login`: eight light/dark captures at the
same widths, keyboard traversal username → password → submit, 44px field and
action targets, native label/autofill semantics, the generic recovery alert,
and no serious/critical axe finding on default or recovery states. The same run
delays the native POST and proves the pending label, spinner, `aria-busy`, and
disabled state for both click and Enter submission.

`pnpm app-shell:evidence` and `pnpm app-shell:evidence:verify` bind 48 base
captures (two roles, six themes, and widths 320, 375, 768, and 1440), plus one
mobile-open capture per role. The run proves the exact five-item inventories,
official identities, one accessibility-tree navigation copy, segment-safe
active state including nested orders, an unobscured first-tab skip link that
focuses main content, 44-pixel targets, IBM Plex Sans, no
overflow, no external request or console failure, and no serious or critical
axe finding. Its visual review is manifest-hash-bound and accepts no unresolved
severity 2 or greater finding.

`pnpm profile:evidence` and `pnpm profile:evidence:verify` bind 36 profile
captures across six themes, both locales, and widths 375/768/1440 plus 14
localized identity/password interaction captures. The exact 50 PNGs and three
metadata files prove finite notices, click/Enter single native document POSTs
with complete URL-encoded fields and CAS, immediate busy/disabled state, 320px
reflow, focus, targets, axe, cookie expiry, persisted-locale signed-out copy,
all-session rejection, old-password denial, and new-password admission. The
review is bound to the current manifest and accepts no
unresolved severity 2 or greater finding.

`pnpm store-settings:evidence` and `pnpm store-settings:evidence:verify` bind
36 storefront-workspace captures across six themes, both locales, and widths
375/768/1440 plus 15 interaction captures. The exact 51 PNGs and three
metadata files prove the disabled-when-unmapped and registry-enabled currency
states, the multipart logo staging route with an owner-readable staged
preview, the opaque upload failure, remove-to-official-fallback, click/Enter
single native save POSTs with dirty-field omission of unchanged extended
fields, immediate busy/disabled feedback, keyboard traversal in control order,
and a successful unchanged save after the stored currency's mapping is
deactivated. The review is bound to the current manifest and accepts no
unresolved severity 2 or greater finding.

`pnpm catalog:evidence` and `pnpm catalog:evidence:verify` bind 49 merchant
catalog captures: the products directory across six themes, both locales, and
widths 375/768/1440 (36), plus thirteen localized state captures covering the
empty directories, the disabled currency-unmapped select, the staged upload
preview, the create notice, the deactivation-with-reassignment block, the
blocked no-replacement explanation, new/edit forms, filtered-empty and
invalid-query states, and the terminal archived read-only view. The run proves
one 200 staging upload with an owner-fenced preview, single native document
POSTs binding category, currency, staged image, and a distinct replacement, no
mutation control on archived products, and the same axe, overflow, target, and
focus gates as the other evidence surfaces; the review is manifest-hash-bound
and accepts no unresolved severity 2 or greater finding.

`pnpm links:evidence` and `pnpm links:evidence:verify` bind 53 merchant
payment-link directory captures: the keyset-paginated `/links` V2 directory
across six themes, both locales, and widths 375/768/1440 (36), plus seventeen
localized state captures covering the empty directory, 320-pixel reflow, the
product-lines and fixed-amount read-only details, the opaque unavailable
detail, filtered-empty, invalid-query, the second keyset page, the create and
edit forms, and the created/edited/failed/deactivated outcome notices. The run
seeds lifecycle fixture links, orders, a single-use settlement, and one
checkout attempt (the financial-edit lock) directly in the disposable database
(public V2 checkout is 9.3.1), drives the real 8.2.2 management UI for both
creates, the dirty-omission expiry edit under the attempt, the opaque locked
financial edit, the blank-clear expiry edit, and activate/deactivate, and
proves the four derived lifecycle badges, the share URL, bounded 25/10
pagination with distinct pages, and the same axe, overflow, target, and focus
gates as the other evidence surfaces; the error directory state is covered by
page tests because stopping the disposable database would break session
resolution before the directory read. The review is manifest-hash-bound and
accepts no unresolved severity 2 or greater finding.

`pnpm merchant-dashboard:evidence` and `pnpm merchant-dashboard:evidence:verify`
bind 47 merchant dashboard captures: the populated dashboard across six
themes, both locales, and widths 375/768/1440 (36), plus eleven localized
state captures covering the empty dashboard, View Store off and on, both
period switches, and 320-pixel reflow. The run seeds the analytics fixture
(labeled and unlabeled currency pairs, products, links, CONFIRMED and AD_HOC
orders, local outcomes, and attempts) directly in the disposable database
(public V2 checkout is 9.3.1), proves confirmed and locally finalized sales
render separately and never summed, the unlabeled-currency treatment,
exact-percent rates, non-color period switching through plain GET links, and
the same axe, overflow, target, and focus gates as the other evidence
surfaces; the review is manifest-hash-bound and accepts no unresolved
severity 2 or greater finding.

The status rail and panels use ruled separation and restrained corners. Never
make a page-specific button variant: use owned `Button` variants. Motion is
reduced when the operating system requests it; no
essential information depends on animation.
