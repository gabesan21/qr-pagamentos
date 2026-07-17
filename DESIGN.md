# QR Pagamentos design system

## Tone

**PIX ledger** is a precise operational financial workspace for administrators of a
Brazilian payment product. Its real-world reference is a Brazilian PIX payment
receipt (*comprovante*) and its audit trail: strong status hierarchy, compact
labelled facts, ruled separation, and one trustworthy action at a time. The
receipt-like status rail is the signature element; it communicates identity,
role, and state as facts rather than as decorative dashboard cards.

Do not use gradients, purple or neon-acid accents, generic three-card
dashboards, decorative charts, rounded-everything surfaces, remote fonts, or
color-only status communication.

## Token contract

`src/app/globals.css` is the sole reference-token source. Its reference values
are raw only between the `design-tokens` markers; components use semantic custom
properties exclusively. `scripts/check-design-tokens.mjs` rejects raw visual
values and inline visual styles in authored UI source. `prefers-color-scheme`
selects the light or dark semantic mapping; this foundation has no manual theme
switch.

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

Contrast is calculated with the WCAG sRGB relative-luminance formula. The
deterministic test checks the following minimums in both themes: normal,
action, success, warning, and danger text at **4.5:1**; focus and essential
control boundaries at **3:1**.

| Theme | Pair | Ratio |
| --- | --- | ---: |
| Light | primary text / page | 15.63:1 |
| Light | action text / primary action | 6.45:1 |
| Light | success text / success | 6.45:1 |
| Light | warning text / warning | 11.23:1 |
| Light | danger text / danger | 6.54:1 |
| Light | focus / page | 6.10:1 |
| Dark | primary text / page | 16.08:1 |
| Dark | action text / primary action | 9.07:1 |
| Dark | success text / success | 9.07:1 |
| Dark | warning text / warning | 12.25:1 |
| Dark | danger text / danger | 10.07:1 |
| Dark | focus / page | 9.78:1 |

## Primitive inventory and state matrix

Owned Radix/nova shadcn source lives in `src/components/ui/`. The following
deliberately small inventory is the only foundation introduced:

| Primitive | Purpose | States |
| --- | --- | --- |
| `Button`, `Field`/`Input`, `NativeSelect`, `Checkbox` | current action and native form controls | default, loading where applicable, disabled, error, hover/focus; empty is not applicable to a control |
| `Card`, `Alert`, `Badge`, `Separator`, `Skeleton`, `Table`, `Spinner` | grouped content, feedback, loading, and facts | documented default, empty/error/recovery, or loading state as applicable |

The deterministic `/design-system` exercise surface resolves its dictionary from
the same server preference contract as the authenticated shell and presents all
applicable states. Its keyboard order is primary action,
field, error recovery, then secondary action. Enabled controls use a visible
two-pixel semantic focus outline; disabled controls are not focusable.

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

The unauthenticated `/login` page consumes the same inventory as a single
restrained credential `Card`: `Field`/`Input` with labels above the native
controls, a destructive `Alert` for the generic invalid-credential recovery,
and a page-local submit control that renders the owned `Button` plus `Spinner`
by observing the associated native form's `submit` event. It never intercepts
or replaces the `/login/submit` POST. Its default, pending/disabled,
error/recovery, and hover/focus states all come from the owned primitives; it
introduces no page-specific variant, token, or adapter.

## Evidence and composition

`pnpm design-system:evidence` builds production output and creates a fresh
run-bound manifest with light/dark captures at 320, 375, 768, and 1440 CSS
pixels. It rejects external requests, serious/critical axe findings, overflow,
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
