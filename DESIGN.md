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
and token lint reject projection drift and raw authored visual values.

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

The deterministic `/design-system` exercise surface resolves its dictionary from
the same server preference contract as the authenticated shell and presents all
applicable states, including labelled default, populated, disabled, and invalid
`Textarea` controls. Its keyboard order follows the rendered controls from the
primary action through fields and recovery actions. Enabled controls use a visible
semantic focus outline or ring at least two pixels wide; disabled controls are not
focusable.

The `/admin` shell and authenticated home consume this inventory directly for
account creation, account mutations, global BRL/PIX payment settings, language
preference, notices, navigation, and logout. Ruled account sections replace the
wide action table at narrow widths. Empty, loading, recovery,
pending/disabled, success, error, and inline destructive-confirmation states are
explicit without page-local variants or compatibility sources.

The authenticated home also owns the bilingual Nautt onboarding ledger. Its
password input never echoes a submitted key; validation, pending/disabled,
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
accepts that exact declaration only in this route; no other inline style or raw
visual value is allowed.

The authenticated `/orders` owner ledger and the read-only `/admin/orders`
administrator ledger reuse the same receipt rail, `admin-navigation`, ruled
`admin-account` fact sections, `Badge` state vocabulary, and `Card`/`Alert`
empty and unavailable states. Order states reuse the checkout state labels;
the policy-exact customer snapshot renders as labelled facts. Cross-owner or
missing order identities render one opaque destructive-`Alert` unavailable
view with a single back action; no order surface owns a mutation control or
page-specific visual variant.

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

The status rail and panels use ruled separation and restrained corners. Never
make a page-specific button variant: use owned `Button` variants. Motion is
reduced when the operating system requests it; no
essential information depends on animation.
