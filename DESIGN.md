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

The type stack is `ui-sans-serif, system-ui, sans-serif`; factual values use
`font-variant-numeric: tabular-nums`. Spacing follows the token scale from
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

There were no reusable primitives or component library before this task. The
following deliberately small inventory is the only foundation introduced:

| Primitive | Purpose | States |
| --- | --- | --- |
| `ActionButton` | one primary or secondary action | default, loading, disabled, hover/focus; empty and error are not applicable to a control |
| `Field` | labelled text input with help text | default, disabled, error, hover/focus; loading and empty are not applicable |
| `Status` | labelled success, warning, or error fact | default and hover/focus when actionable; loading, empty, and disabled are not applicable |
| `Panel` | ruled content grouping | default, loading, empty, error with recovery action; hover/focus and disabled are not applicable to a non-control |
| `AdminSubmit` | form-status adapter for `ActionButton` | default, loading, disabled, hover/focus; empty and error remain the surrounding form's responsibility |

The deterministic `/design-system` exercise surface resolves its dictionary from
the same server preference contract as the authenticated shell and presents all
applicable states. Its keyboard order is primary action,
field, error recovery, then secondary action. Enabled controls use a visible
two-pixel semantic focus outline; disabled controls are not focusable.

The `/admin` shell consumes this inventory for account creation, account
mutations, language preference, and logout. Its empty account list, server
recovery status, and pending submits make the screen-level empty/error/loading
states explicit without adding a second button style.

## Composition and motion

The status rail and panels use ruled separation and restrained corners. Never
make a page-specific button variant: use `ActionButton` modes. Motion is
reduced when the operating system requests it; no essential information depends
on animation.
