# QR Pagamentos frontend memory

This document is the implementation-facing memory for
[[pop/specs/application-frontend-system|Application frontend system]]. The
closed role-neutral `/design-system` specimen makes the shared foundation
observable and evidence-bound; product route-family migration remains partial,
so existing route contracts remain authoritative outside that boundary.

## Authority

- Presentation and interaction feedback come from the immutable supplied
  template through `docs/frontend-template-parity/manifest.json` and
  `obligations.ndjson`. The readable contract is
  [`docs/frontend-template-parity/README.md`](docs/frontend-template-parity/README.md).
- Business behavior, routes, authorization, owner scope, exact decimals,
  redaction, security, and provider behavior come from `pop/specs/` and the DOX
  tree. Those contracts always win a conflict.
- Template fixtures, local storage, mock sessions, mock totals, Vite, React
  Router, Tailwind 3, and browser-side service behavior are reference-only.
- Production stays Next.js App Router, React 19, Tailwind CSS 4, server-first
  rendering, and narrow interaction-specific client boundaries.

## Tone

The single direction is **professional settlement console**: calm neutral work
surfaces, compact financial facts, crisp bordered cards, restrained elevation,
direct status feedback, and accent reserved for action, selection, focus, and
measured emphasis. The immutable template is the visual reference; extract its
working-console hierarchy and rhythm, never its mock behavior.

Avoid generic purple SaaS gradients, glass panels, oversized marketing type,
pill-shaped containers used as decoration, gratuitous charts, and alternate
page-local brands. Sora, Inter, and IBM Plex Mono are the only target families;
unapproved substitutes are not target typography.

## Token contract

### DTCG layers and resolution

All visual values enter production through DTCG 2025.10 tokens. Paths use
lowercase hyphenated segments and resolve in this order:

1. `primitive`: raw colors, dimensions, durations, easing, font families,
   weights, and shadow members. Snapshot colors live under
   `color.primitive.audit.template.<theme>.*` byte-equivalent to the supplied
   source; audit primitives are evidence and are never consumed directly by a
   component.
2. `semantic`: stable intent aliases for page, surface, text, action, feedback,
   focus, spacing, type, radius, shadow, layer, and motion.
3. `component`: aliases only where a shared component needs a value more
   specific than a semantic role.
4. `theme`: one resolver modifier selects exactly one of the six theme contexts;
   it replaces semantic color and elevation values without changing paths.

Color `$value` objects use `colorSpace: "srgb"`, normalized components
(`R/255`, `G/255`, `B/255`), and the exact six-digit `hex` fallback below.
Dimensions are `{ value, unit: "px" | "rem" }`; durations use `ms`; typography,
transition, and shadow use their DTCG composite types. References use
`{path.to.token}`. Every reference resolves, token types are explicit or
inherited, and circular aliases fail validation. Raw visual values outside the
token source remain lint failures.

The stable semantic color paths are:

| Area | Paths |
| --- | --- |
| Surfaces | `color.surface.page`, `raised`, `secondary`; `color.border.default` |
| Text | `color.text.primary`, `secondary`, `tertiary` |
| Action | `color.action.accent`, `foreground`, `soft` |
| Feedback | `color.feedback.success`, `warning`, `danger`, `info` and each `.soft` companion |
| Focus/depth | `color.focus.ring`; `shadow.elevation.card`; `shadow.elevation.modal` |

### Projected utility vocabulary

`src/app/globals.css` `@theme inline` binds the template's Tailwind names in
`docs/template/app/tailwind.config.js` to the semantic variables above — never
to a literal — so every utility works in all six themes and the WCAG `text-3`
override applies automatically:

| Utility | Bound role |
| --- | --- |
| `bg-bg` | `color.surface.page` |
| `bg-surface` / `bg-surface-2` | `color.surface.raised` / `secondary` |
| `text-text` / `text-text-2` / `text-text-3` | `color.text.primary` / `secondary` / `tertiary` (AA projection) |
| `bg-accent` / `text-accent` | `color.action.accent` — the **strong** template accent |
| `text-accent-fg` | `color.action.foreground` (on-accent text) |
| `bg-accent-soft` | `color.action.soft` — the pale tint, a distinct name from `accent` |
| `bg-success` / `bg-warning` / `bg-danger` / `bg-info` | `color.feedback.<role>` |
| `bg-success-soft` / `bg-warning-soft` / `bg-danger-soft` / `bg-info-soft` | `color.feedback.<role>.soft` |
| `rounded-card` / `rounded-pill` | `radius.semantic.lg` / `pill` |
| `shadow-card` | `shadow.elevation.card` |
| `font-display` / `font-money` | `font.semantic.display` / `numeric` |
| `max-w-app` / `max-w-checkout` / `max-w-auth-form` | `layout.semantic.app` / `checkout` / `auth-form` |

The legacy shadcn `--color-accent-foreground` stays bound to
`color.text.primary` and is **not** the on-accent foreground; use
`text-accent-fg` for text placed on a strong `bg-accent` surface. Existing
shadcn utilities (`bg-primary`, `bg-muted`, `bg-destructive`, …) keep working
unchanged alongside this vocabulary.

The exact audit palette is the projection of
`docs/template/app/src/index.css` at SHA-256
`762edf36239e6472ccfc8eb8faa79d73081633dec69ae4fa0fa5a530ccdcead4`:

| Theme | Page / raised / secondary / border | Primary / secondary / tertiary text | Accent / foreground / soft | Success / soft | Warning / soft | Danger / soft | Info / soft |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pix-paper` | `#f7f4ee / #ffffff / #f1ede4 / #e4ded1` | `#1e2a26 / #4a5a54 / #8a958e` | `#00b8a0 / #ffffff / #d9f4f0` | `#1e9e5a / #dcf3e6` | `#b7791f / #faebd3` | `#c63b3b / #fadfda` | `#2b6cb0 / #dce9f8` |
| `cashier-daylight` | `#f4f6f8 / #ffffff / #edf1f4 / #dde3e9` | `#16202b / #45525f / #8794a1` | `#2456e6 / #ffffff / #e2eafd` | `#15803d / #ddf3e4` | `#a16207 / #f8edd4` | `#b91c1c / #fadede` | `#0369a1 / #daeef9` |
| `settlement-sand` | `#f3eee3 / #fbf8f0 / #ece5d4 / #dcd2bc` | `#2b2417 / #5c5240 / #978b74` | `#a85b1e / #ffffff / #f3e1cd` | `#4d7c0f / #e6f0d4` | `#92400e / #f6e4c8` | `#a63535 / #f5dbd5` | `#315c8c / #dce6f2` |
| `midnight-clearing` | `#0c111b / #141b29 / #1c2536 / #28334a` | `#eaeff7 / #a9b6c9 / #647189` | `#5eead4 / #08251f / #1e3a38` | `#34d399 / #173a2e` | `#fbbf24 / #3e3312` | `#f87171 / #402022` | `#60a5fa / #1b2e4c` |
| `vault-blue` | `#0b1220 / #111a2e / #182444 / #263659` | `#e7edf9 / #a5b4d2 / #5f7195` | `#4f8dfd / #ffffff / #1b2e5c` | `#3ecf8e / #14352a` | `#f5b93f / #3b2f10` | `#ef6a6a / #3e1e22` | `#7aa8ff / #1c2b50` |
| `terminal-amber` | `#100d08 / #1a1510 / #241d13 / #3a2f1e` | `#f5e8ce / #cbb68f / #8a7550` | `#ffb224 / #241700 / #33270d` | `#8fcb5c / #24300f` | `#ffd166 / #3a3010` | `#ff7a5c / #3d1d14` | `#e8b04b / #33270d` |

WCAG 2.2 AA overrides byte-identical rendering when an audit color fails the
required contrast. Template occurrences authored as normal `text-3` consume
`color.text.tertiary`; they never consume the audit primitive directly. Derive
that semantic value independently per theme from audit tertiary `O` toward
audit primary text `P`: for integer `k = 0..255`, compute each gamma-encoded
sRGB byte as `floor(O + (P - O) * k / 255 + 0.5)`, and select the first `k`
whose WCAG contrast is at least `4.5:1` against all three applicable base
surfaces: page, raised, and secondary. These are the fixed outputs:

| Theme | `k` | Rendered `color.text.tertiary` | Page / raised / secondary contrast |
| --- | ---: | --- | --- |
| `pix-paper` | 92 | `#636e68` | `4.830 / 5.302 / 4.538` |
| `cashier-daylight` | 81 | `#636f7c` | `4.733 / 5.128 / 4.515` |
| `settlement-sand` | 91 | `#706653` | `4.886 / 5.327 / 4.503` |
| `midnight-clearing` | 54 | `#808ca0` | `5.556 / 5.069 / 4.518` |
| `vault-blue` | 55 | `#7c8cab` | `5.524 / 5.117 / 4.508` |
| `terminal-amber` | 30 | `#97835f` | `5.288 / 4.943 / 4.545` |

The verifier linearizes normalized sRGB with
`c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ^ 2.4`, calculates
`L = 0.2126R + 0.7152G + 0.0722B`, and calculates contrast as
`(Llighter + 0.05) / (Ldarker + 0.05)`. A `text-3` occurrence on an accent,
feedback-soft, image, or other background must consume a separately validated
semantic on-color; this three-surface proof cannot be reused there. Thus the
immutable primitive remains exact for parity audit while the semantic token
rendered to users is contrast-safe and implementation-ready.

Focus and card depth resolve exactly as follows:

| Theme | Focus ring | Card elevation |
| --- | --- | --- |
| `pix-paper` | `rgba(0,184,160,.35)` | `0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.08)` |
| `cashier-daylight` | `rgba(36,86,230,.35)` | same light elevation |
| `settlement-sand` | `rgba(168,91,30,.35)` | same light elevation |
| `midnight-clearing` | `rgba(94,234,212,.40)` | `inset 0 1px 0 rgba(255,255,255,.04), 0 8px 24px rgba(0,0,0,.35)` |
| `vault-blue` | `rgba(79,141,253,.45)` | same dark elevation |
| `terminal-amber` | `rgba(255,178,36,.45)` | same dark elevation |

`shadow.elevation.modal` is exactly `0 16px 48px rgba(0,0,0,.28)`. Do not
approximate these values in a component; the hash-bound source remains the exact
remainder for every authored occurrence.

Stored theme IDs remain exactly `pix-paper`, `cashier-daylight`,
`settlement-sand`, `midnight-clearing`, `vault-blue`, and `terminal-amber`.
`pix-paper` is the safe light fallback and `midnight-clearing` is the dark-system
fallback unless a valid stored choice wins. Components never branch by theme ID.

### Typography

| Role | Family | Size / line height | Weights | Extra rule |
| --- | --- | --- | --- | --- |
| Body and controls | Inter | `14px / 20px` default | 400, 500, 600 | Normal tracking |
| Display and headings | Sora | template/parity occurrence | 400, 500, 600, 700 | `-0.02em` tracking |
| Money, IDs, codes, dates | IBM Plex Mono | template/parity occurrence | 400, 500, 600 | Tabular numerals |

The common type compositions are page heading `24px/32px` semibold, section
heading `18px/26px` semibold, compact heading `15px/22px` semibold, body
`14px/20px`, field label `13px/18px` medium, caption `12px/16px`, micro label
`11px/16px`, and large money/stat `22px/28px` semibold. Any additional authored
size or line-height is consumed by exact parity occurrence, never guessed.

All three families must come from pinned, licensed, committed, self-hosted
production bytes with dependency and license provenance. No Google Fonts or
other runtime host is a fallback. System fallbacks preserve legibility only and
never satisfy visual evidence. Static identity assets contain no live font.

### Geometry, spacing, and motion

- Radius tokens are exactly `6px`, `8px`, `10px`, and `999px` for pills.
- Application width cap is `1280px`; default public checkout cap is `560px`;
  authentication form cap is `420px`.
- Authenticated rail is `248px`, top bar and rail header are `56px`, directory
  rows are `52px`, compact controls are `40px`, and primary auth actions are
  `48px`. The accessible target minimum still wins: `44×44px`.
- Common card padding is `20px`; inter-card gap is `16px`. Related items remain
  at most `16px` apart; distinct sections are at least `32px` apart.
- Labels sit above controls. Prose is at most `65ch`. A section has at most one
  primary action. More than seven navigation/actions require grouping or search.
- Page grids may move from one column to two at `640px`, then to the exact
  template composition at `1024px`. No page has horizontal document overflow at
  `320px`; dense directories use a deliberate narrow facts composition.
- Full motion follows the parity interaction record. Reduced motion collapses
  non-essential animation and transition durations to `0.01ms` with one
  iteration while preserving final state, focus, and feedback.

## Locale and content

The only locales are `pt-BR` and `en`, resolved by the existing persisted,
unprefixed-route contract. Labels, validation, notices, metadata, accessible
names, empty/error/retry copy, and public copy are equivalent in both. Never
introduce `/{locale}` routes, literal-only translations in a component, or a
translation that changes capability or disclosure.

Money stays an exact canonical decimal string and uses server-resolved currency
labels. Never use JavaScript floating-point money math. Provider-confirmed and
locally finalized facts remain separate. Opaque errors never echo an identifier,
submitted query, identity, authorization cause, provider body, or secret.

## Identity and asset boundary

The supplied logo, texture, illustrations, fallbacks, and theme swatches are
installed as the production family by task `12.2.2`. Their canonical sources,
deterministic safe-SVG derivatives, hashes, closed inventory, provenance,
accessible-name rules, and media-owner controls are runtime truth.

No page copies logo geometry, embeds remote bytes, builds a text lockup from a
live font, or invents an alternate merchant fallback. A mark beside visible
identity text is decorative; a meaningful standalone mark has exactly one
localized accessible name. Merchant fallback identifies QR Pagamentos only
while no merchant image exists and never implies merchant ownership. Product
and storefront media continue through [[pop/specs/media-storage|Secure media
storage]]; template assets do not bypass that lifecycle.

## Responsive shells

### Authentication

- Center one bordered card up to `720px`. At `900px` and above, show the exact
  `300px` brand panel beside the form; below it, omit the panel rather than
  compressing it. The form remains at most `420px` with `24px`/`32px` responsive
  padding and an accessible language control.
- Preserve credential, MFA, recovery, and unavailable semantics from
  [[pop/specs/identity-security|Identity security]] and the administrative
  foundation. Username and password are the only login credentials; email is
  never a login or reset-delivery mechanism.
- The template supplies composition and feedback only. It cannot create a mock
  role switcher, local session, reset delivery, route, or authorization state.

### Authenticated application

- Below Tailwind `lg` (`1024px`), one disclosure opens a `248px` modal drawer;
  at or above `lg`, one persistent rail occupies that width. Only one navigation
  copy is present in the accessibility tree.
- The sticky `56px` top bar contains page identity, locale, and the role-safe
  account menu. Main content is centered to `1280px` with `16px` padding below
  `lg` and `24px` from `lg`.
- Administrator and merchant inventories remain separate fixed five-entry
  lists. Active state uses `aria-current="page"` plus a non-color marker.
  Shells receive inert labels, links, identity, username, locale, and children;
  no business DTO or service crosses into `src/app-shell/`.
- A skip link precedes sticky chrome. Drawer disclosure, close, account menu,
  locale, and logout meet the target minimum and preserve keyboard focus.

### Public payment and storefront surfaces

- `/pay/[identifier]` follows the parity checkout composition and existing V1 /
  V2 precedence. The existing branded V2 two-column contract may widen to the
  application cap and stack on narrow screens; the visual target must never
  collapse or reshape its business DTO.
- `/store/[slug]` is an authorized extrapolation: use the same tokens,
  typography, identity, feedback, card/table components, and responsive laws to
  render the existing grouped catalog and browser-local cart in the persisted
  `boxed` or `table` layout. Keep the public redaction and exact-money contracts.
- `/store/[slug]/pay` is an authorized extrapolation: use the same branded
  public shell and checkout-width composition, preserve the return-to-store
  affordance and the standalone state machine, and keep the current server trust
  boundary.
- The two extrapolations never copy the template's incorrect shortcut from a
  storefront slug to `/pay/[identifier]`; current routes and commands win.

## Shared component ownership and anti-drift

Production primitives and role-neutral compositions live only in
`src/components/ui/` and are imported from that path. The owned primitive
foundation is `Alert`, `AlertDialog`, `Avatar`, `Badge`, `Button`, `Card`,
`Checkbox`, `Dialog`, `Empty`, `Field`/`FieldGroup`, `Input`, `InputOTP`, `Label`,
`NativeSelect`, `Pagination`, `Separator`, `Skeleton`, `Sonner`, `Spinner`,
`Switch`, `Table`, `Tabs`, and `Textarea`; pages do not fork their styling.

Task `12.2.3` delivers the reachable shared compositions `CopyField`,
`EmptyState`, `LocalizedFieldGroup`, `Modal`/`ConfirmDialog`, `MoneyText`,
`Monogram`, `QrDisplay`, `SimpleTabs`, the five `Skeletons`, `StatCard`,
`StatusBadge`, `Timeline`, and `ToastViewport`/`showToast`. `DataDirectory` is
the single owner for the reachable `DataTable` and `FilterBar` responsibilities;
it composes canonical previous/next pagination and never adds total-count,
page-number, arbitrary sorting, or client-list behavior. The executable map is
`src/components/ui/inventory.json`, checked by
`scripts/check-shared-ui-inventory.mjs`: all 187 assigned obligations map once,
and all 49 unreachable generated sources remain exclusions. Official supporting
sources are recorded with one insufficiency finding each.

Task `14.2.4` brings `owners` to template parity without adding to that
20-entry set: `status-badge.tsx` renders a soft-tint pill with a `bg-current`
dot (or `Archive` icon when archived, struck-through label when archived or
deleted) and exports `StatusBadge` plus five closed-union domain families —
`ProviderStateBadge`, `LocalOutcomeBadge`, `LinkLifecycleBadge`,
`AccountStateBadge`, `EntityStateBadge` — over one shared tone map, with tone,
shape, and labels owned centrally while every caller still supplies its own
localized `labels`; `copy-field.tsx` adds a `compact` chip variant;
`monogram.tsx` adds an `xl` (48px) accent-soft size; `qr-display.tsx` accepts
an optional `payload` and generates the QR client-side with the pinned
`qrcode` package (error correction `H` when an `identity` centre-cut is
present) while still honoring an explicitly passed `graphic`; `stat-card.tsx`
accepts an optional `sparkline` rendered as an `aria-hidden` accent SVG
polyline. A genuinely new component that a template obligation marks
`excluded-unreachable-generated-ui` — the accessible drop-tile `ImageUploader`
(idle, drag-over, staging, staged with preview/replace/remove, failed with
retry, disabled) — is recorded in `inventory.json`'s `localAdditions` section
instead of `owners`: owner, public API, states, and a one-line insufficiency
finding, never counted against the 20 reachable template sources.

Before adding a component:

1. Search the production inventory and the reachable parity graph.
2. Reuse or extend the single owner when its responsibility matches.
3. If genuinely new **and reachable**, record one owner/import path, public
   props, complete applicable states, and a one-line insufficiency finding in
   `owners`. If genuinely new but the template marks its source
   `excluded-unreachable-generated-ui`, record the same contract in
   `localAdditions` instead — it never enters `owners`.
4. Update the executable inventory with the owner, public props, applicable
   states, and insufficiency finding. The closed `/design-system` specimen
   exercises every reachable shared owner and its applicable state across both
   locales, all six themes, and the fixed responsive matrix.

Every `excluded-unreachable-generated-ui` obligation remains excluded. An
unreachable generated template file, including a registry component, is not an
implementation candidate and is never added merely because it exists — a
genuinely needed local owner is recorded in `localAdditions`, never in
`owners`.

## State contract

Every component documents the baseline states **default**, **loading** when
applicable, **empty** when applicable, **error with recovery**, **hover and
visible focus**, and **disabled**. Add populated, invalid, active, selected,
success, confirmation, pending, or terminal states only when its behavior needs
them. Mark a state non-applicable instead of simulating it.

| Owner | Required applicable states and feedback |
| --- | --- |
| Actions and controls | default, populated where value-bearing, invalid with associated message, hover, visible focus, pending/loading, disabled; label remains associated and above the control |
| Data directories | ready, loading with geometry-preserving skeleton, empty, filtered-empty with reset, invalid-query reset, request error with retry, pagination/filter selection; desktop table and narrow facts expose one action set |
| Empty/unavailable | localized illustration, title, optional body and one recovery/CTA; empty is never destructive and unavailable discloses no cause |
| Filters and tabs | default, active/selected with non-color marker, clear/reset, hover/focus, disabled; URL and native GET behavior remain server-authoritative |
| Identity | image or initial fallback, meaningful or decorative naming, and size variants including the `xl` accent-soft `Monogram`; bytes and lifecycle remain media-authoritative |
| Modal/confirmation | closed/open, initial focus, keyboard loop, escape/overlay dismissal when allowed, destructive confirmation, pending/disabled, failure without accidental close, focus restoration |
| Copy and QR | ready, copy pending, copied success announced politely, copy failure/retry, in either the button or compact chip `CopyField` variant; QR preparing, available, waiting/recovery, and terminal states preserve alternative text and exact payload boundaries whether the caller supplies a `graphic` or `QrDisplay` generates it from `payload` |
| Upload | idle, drag-over, staging, staged with preview/replace/remove, failed with retry, and disabled, each visually distinguishable without relying on color alone; staging boundary and identifiers stay caller-owned |
| Status, money, timeline, stats | ready, empty where data-driven, loading skeleton, unavailable/error; text/icon/shape accompanies color, numeric facts use mono tabular type, `StatusBadge`'s five domain families share one tone map, and `StatCard`'s optional sparkline is a decorative `aria-hidden` accent trend, never the sole trend indicator |
| Toast/alert | info, success, warning, destructive error, dismiss, retry, auto-dismiss only where safe; use polite/assertive live semantics appropriate to urgency |

### Page and journey states

- Every data-driven page covers ready, loading, empty, filtered-empty where it
  filters, unavailable, validation error, request error, success notice, retry,
  pending/disabled, and destructive confirmation where applicable.
- Authentication covers empty credentials, local validation, submit pending,
  generic invalid credentials, MFA challenge, TOTP/recovery-code modes, wrong
  proof, lock/recovery, success, cancellation, and opaque unavailable states as
  allowed by the identity contract.
- Password recovery covers token loading, valid form, validation, request error,
  invalid/expired/used token, pending, and success. Presentation does not invent
  email delivery or expose token validity beyond the existing route contract.
- Checkout and standalone payment cover initial form, policy-exact validation,
  submitting/disabled, reserved/creating/preparing, QR and copy, pending and
  indeterminate waiting, visibility-aware polling, status error with manual
  retry, retryable submit error, expired capability, opaque unavailable, and the
  exact confirmed/rejected/cancelled/expired/refunded or paid terminal states
  owned by the checkout spec.
- Catalog, links, orders, dashboards, profiles, and settings also preserve their
  spec-owned archived/deleted, immutable-version, exact-period, empty-prerequisite,
  conflict, staged-media, credential, and provider-recovery states. Parity never
  authorizes a new projection or mutation to fill a visual gap.

## Accessibility and feedback

- WCAG 2.2 AA is the minimum and wins over byte-identical visual rendering:
  normal text contrast is at least `4.5:1`; large text and essential non-text
  boundaries are at least `3:1`. Exact snapshot bytes remain audit primitives;
  users receive the validated semantic projection defined above.
- Every actionable target is at least `44×44` CSS pixels unless the template
  fixes a larger size. Focus is an unobscured semantic ring visibly equivalent
  to `3px`; never remove it without an equal replacement.
- Use semantic labels/descriptions, logical headings, keyboard operation,
  skip navigation, correct table/dialog/tab semantics, and no color-only state.
- Success, copy, pending, and error feedback uses appropriate live semantics.
  Disabled controls are visually distinct; unavailable actions are absent or
  explained rather than deceptively enabled.
- Loading preserves final geometry. Motion conveys no essential information,
  and focused elements do not move unexpectedly.

## Business and security precedence

Follow these durable authorities instead of restating their implementation:

- [[pop/specs/administrative-foundation|Administrative foundation]] for roles,
  locale, shells, directories, redaction, and administrator capabilities.
- [[pop/specs/catalog-and-payment-links|Catalog and payment links]] for V1/V2
  compatibility, owner scope, lifecycle, and exact link composition.
- [[pop/specs/checkout-and-order-lifecycle|Checkout and order lifecycle]] for
  customer policy, exact money, capabilities, polling, and terminal states.
- [[pop/specs/storefront-and-customization|Storefront and customization]] for
  public projection, cart, stored customization, and standalone payments.
- [[pop/specs/identity-security|Identity security]] for MFA and recovery.
- [[pop/specs/media-storage|Secure media storage]] for owned image bytes.
- [[pop/specs/nautt-finance-integration|Nautt Finance integration]] for
  credentials, provider states, webhook/payment boundaries, and redaction.

Stop the visual lane if parity would weaken role/owner/origin/rate-limit,
redaction, exact-decimal, V1 compatibility, secret, media, or provider rules.
Never solve a presentation gap with a backend/API/database change.

## Objective evidence

The parity manifest binds 2,230 obligations in
`docs/frontend-template-parity/obligations.ndjson` at SHA-256
`7b62118ffae748e8ef7384cccac4792ce60440166660b3cfe0b6c2e9431a8c93`.
Each route/component owner consumes its exact obligation IDs, dispositions,
source hashes, target paths, state fixture, locale/theme applicability, and
later-owner assignment. Missing, stale, duplicate, generic, hand-authored, or
source-divergent evidence fails closed.

| Dimension | Fixed requirement |
| --- | --- |
| Browser | repository Playwright `chromium` project, Chromium engine, device scale factor 1 |
| Environment | fixed fixture clock, locally settled fonts, animations disabled, caret hidden, external requests blocked |
| Viewports | full-page `320×1000`, `375×1000`, `768×1000`, `1440×1000` |
| Matrix | both locales, all six themes when applicable, and every obligation-owned state |
| Raster | threshold `0.1`, maximum differing-pixel ratio `0.001` |
| Independent assertions | geometry, typography, content, keyboard/focus, overflow, accessibility, console, requests, and contract behavior |

Raster tolerance never waives an independent assertion. Evidence is run-bound
and fresh; it cannot reuse a prior manifest or claim another route's capture.
`pnpm design-system:evidence:verify` verifies the current closed specimen run,
including its 48 locale/theme/viewport captures, coverage/state map,
interaction probes, and bound sources. `pnpm frontend-parity:check` validates
the immutable inventory and `pnpm check` protects application behavior. These
gates do not claim visual conformance for a product route family outside the
specimen boundary.
