---
id: application-frontend-system
project: qr-pagamentos
domain: frontend
kind: contract
status: active
implementation: partial
origin: "roadmap/12-frontend-template-remodel"
created: 2026-08-02
updated: 2026-09-07
supersedes: [administrative-design-system]
superseded_by:
---

# Spec — Application frontend system

## Contract

This spec defines the application-wide presentation, composition, interaction-feedback, responsive, accessibility, asset, and parity contract derived from the supplied template. It supersedes the Epoch 1 administrative-only visual direction while preserving every established business, authorization, security, redaction, money, and runtime contract.

## Authority and precedence

- `docs/frontend-template-parity/manifest.json` and `obligations.ndjson` are the hash-bound authority for reachable template presentation, states, interactions, assets, locales, themes, current surfaces, and exclusions; the template source is read-only reference, not code to transplant.
- Existing specs and DOX remain authoritative for roles, ownership, routes, native mutations, data visibility, exact decimals, lifecycle, security, and provider behavior. A conflict is resolved in favor of those contracts and recorded before UI work continues.
- Template mocks, local-storage sessions, totals, sorting, pagination, analytics, routes, provider calls, and fixture state never authorize production behavior.
- The production runtime remains Next.js App Router, React 19, Tailwind CSS 4, server-first rendering, and narrow interaction-specific client boundaries. Vite, React Router, Tailwind 3, and mock stores are excluded.

## Visual language and numeric composition

- The single tone is **professional settlement console**: calm neutral work surfaces, compact financial facts, crisp bordered cards, restrained elevation, direct status feedback, and accent color reserved for action, selection, focus, and measured emphasis.
- The exact authored visual values and responsive occurrences are the parity records, not approximations. Their production form is DTCG audit primitives → semantic aliases → component tokens with stable paths and no raw page-local visual values. Every snapshot value remains byte-equivalent at `color.primitive.audit.template.<theme>.*`; accessibility may change a rendered semantic alias but never those audit primitives.
- The fixed semantic palette roles are page, surface, secondary surface, border, three text levels, accent/foreground/soft/soft-foreground, success/warning/danger/info with soft and soft-foreground companions, focus ring, and elevation. All six themes implement the same paths.
- The semantic palette is projected as named Tailwind utilities (`bg-surface`, `text-text-2`, `bg-accent`/`bg-accent-soft`, `bg-success`/`-soft`, `rounded-card`, `shadow-card`, `font-display`, `max-w-app`, …) in `src/app/globals.css` `@theme inline`, each bound to a semantic variable, never a literal; `accent` is the strong template accent and `accent-soft` is the pale tint.
- The exact palette source is the immutable `docs/template/app/src/index.css` snapshot SHA-256 `762edf36239e6472ccfc8eb8faa79d73081633dec69ae4fa0fa5a530ccdcead4`; its complete theme blocks must remain byte-equivalent audit primitives. These anchors make theme identity reviewable without reopening every component:

| Theme | `bg / surface / surface-2 / border` | `text / text-2 / text-3` | `accent / accent-fg / accent-soft` |
|---|---|---|---|
| `pix-paper` | `#f7f4ee / #ffffff / #f1ede4 / #e4ded1` | `#1e2a26 / #4a5a54 / #8a958e` | `#00b8a0 / #ffffff / #d9f4f0` |
| `cashier-daylight` | `#f4f6f8 / #ffffff / #edf1f4 / #dde3e9` | `#16202b / #45525f / #8794a1` | `#2456e6 / #ffffff / #e2eafd` |
| `settlement-sand` | `#f3eee3 / #fbf8f0 / #ece5d4 / #dcd2bc` | `#2b2417 / #5c5240 / #978b74` | `#a85b1e / #ffffff / #f3e1cd` |
| `midnight-clearing` | `#0c111b / #141b29 / #1c2536 / #28334a` | `#eaeff7 / #a9b6c9 / #647189` | `#5eead4 / #08251f / #1e3a38` |
| `vault-blue` | `#0b1220 / #111a2e / #182444 / #263659` | `#e7edf9 / #a5b4d2 / #5f7195` | `#4f8dfd / #ffffff / #1b2e5c` |
| `terminal-amber` | `#100d08 / #1a1510 / #241d13 / #3a2f1e` | `#f5e8ce / #cbb68f / #8a7550` | `#ffb224 / #241700 / #33270d` |
- WCAG 2.2 AA takes precedence at the rendered semantic layer. Normal text authored as template `text-3` consumes `color.text.tertiary`, not the audit primitive. For each theme, derive it by testing integer steps `k = 0..255` from audit `text-3` `O` toward audit primary text `P`: each sRGB byte is `floor(O + (P - O) * k / 255 + 0.5)`; choose the first `k` whose WCAG relative-luminance contrast is at least `4.5:1` against page, raised, and secondary surfaces. The resulting fixed projections and ratios in that surface order are:

| Theme | `k` | Rendered `color.text.tertiary` | Page / raised / secondary |
|---|---:|---|---|
| `pix-paper` | 92 | `#636e68` | `4.830 / 5.302 / 4.538` |
| `cashier-daylight` | 81 | `#636f7c` | `4.733 / 5.128 / 4.515` |
| `settlement-sand` | 91 | `#706653` | `4.886 / 5.327 / 4.503` |
| `midnight-clearing` | 54 | `#808ca0` | `5.556 / 5.069 / 4.518` |
| `vault-blue` | 55 | `#7c8cab` | `5.524 / 5.117 / 4.508` |
| `terminal-amber` | 30 | `#97835f` | `5.288 / 4.943 / 4.545` |
- The calculation uses WCAG sRGB linearization (`c <= 0.04045 ? c/12.92 : ((c + 0.055)/1.055)^2.4`), luminance `0.2126R + 0.7152G + 0.0722B`, and `(Llighter + 0.05) / (Ldarker + 0.05)`. A `text-3` occurrence on any other background must use a separately validated semantic on-color; it may not fall back to the audit primitive or assume this three-surface proof applies.
- The same `k`-step method projects text rendered over a soft-tinted surface (`bg-<tone>-soft`, `.text-<tone>-on-soft`): origin `O` is the audit tone hex (`color.primitive.audit.template.<theme>.<tone>` for `success`/`warning`/`danger`/`info`, `.accent` for `action`), target `P` is rendered `color.text.primary`, and the single background is that same tone's rendered soft surface, minimum ratio `4.5:1`. The five roles across all six themes never fall back to `text-<tone>` (the strong role) on a soft surface:

| Theme | success · warning · danger · info · action (`k`, hex, ratio vs soft surface) |
|---|---|
| `pix-paper` | success k=76 `#1e7b4b` 4.513 · warning k=70 `#8d6321` 4.541 · danger k=23 `#b73939` 4.547 · info k=6 `#2b6aad` 4.526 · action k=111 `#0d7a6b` 4.522 |
| `cashier-daylight` | success k=10 `#157c3c` 4.526 · warning k=14 `#995e09` 4.560 · danger k=0 `#b91c1c` 5.105 · info k=0 `#0369a1` 4.967 · action k=0 `#2456e6` 4.909 |
| `settlement-sand` | success k=14 `#4b770f` 4.507 · warning k=0 `#92400e` 5.689 · danger k=0 `#a63535` 5.021 · info k=0 `#315c8c` 5.475 · action k=31 `#99541d` 4.522 |
| `midnight-clearing` | success k=0 `#34d399` 6.498 · warning k=0 `#fbbf24` 7.456 · danger k=0 `#f87171` 5.244 · info k=0 `#60a5fa` 5.357 · action k=0 `#5eead4` 8.265 |
| `vault-blue` | success k=0 `#3ecf8e` 6.691 · warning k=0 `#f5b93f` 7.433 · danger k=0 `#ef6a6a` 4.909 · info k=0 `#7aa8ff` 5.873 · action k=21 `#5c95fd` 4.505 |
| `terminal-amber` | success k=0 `#8fcb5c` 7.221 · warning k=0 `#ffd166` 9.045 · danger k=0 `#ff7a5c` 5.917 · info k=0 `#e8b04b` 7.477 · action k=0 `#ffb224` 8.105 |
- Body copy is Inter at 14px/20px; display copy is Sora with `-0.02em` tracking; money, identifiers, codes, and numeric facts are IBM Plex Mono with tabular numerals. Only template-used weights are admitted: Sora 400/500/600/700, Inter 400/500/600, and IBM Plex Mono 400/500/600.
- Fonts are pinned, licensed, self-hosted production assets with committed dependency/license provenance and no runtime request to Google Fonts or another host. Fallbacks may preserve usability but do not satisfy parity evidence.
- The shared radii are 6px, 8px, 10px, and 999px pill; the application cap is 1280px, checkout cap 560px, authentication form cap 420px, desktop rail 248px, top bar 56px, table row 52px, and compact controls 40px unless the interactive-target rule requires 44px or 48px.
- Auth uses a 720px split card with a 300px brand panel from 900px upward. Authenticated navigation is a drawer below Tailwind `lg` (1024px) and a persistent rail at or above it. Shell content padding is 16px below `lg` and 24px from `lg`.
- Cards commonly use 20px internal padding and 16px inter-card gaps. Related items stay within 16px; distinct sections use at least 32px. Labels sit above controls, prose is at most 65ch, and each section has at most one primary action.
- Page grids may move from one column to two at 640px and to the exact template multi-column composition at 1024px. Every surface must fit at 320px without horizontal page overflow; wide directories provide a deliberate narrow composition rather than shrinking unreadably.

## Theme, locale, identity, and assets

- The stored theme identifiers remain exactly `pix-paper`, `cashier-daylight`, `settlement-sand`, `midnight-clearing`, `vault-blue`, and `terminal-amber`; identifiers are never renamed or branched inside components. `pix-paper` is the safe light fallback and `midnight-clearing` the dark-system fallback unless an established stored selection wins. Since 14.2.2 the established selection for authenticated surfaces is the `qr_theme` cookie: the root layout stamps `data-theme` on `<html>` only when a principal resolved and the cookie holds one of the six ids, and the shell account menu offers the instant six-swatch picker that writes it; unauthenticated public surfaces keep `data-theme-preview`.
- The supported locales remain exactly `pt-BR` and `en` on the existing unprefixed-route preference contract. All labels, validation, notices, empty/error/retry states, metadata, accessible names, and public copy are equivalent in both locales.
- The supplied logo, texture, illustrations, fallbacks, and theme swatches are approved presentation targets. Production use must flow through the existing safe-SVG, generated-derivative, hash, inventory, accessibility, and provenance controls; no page-local copy, live-font static lockup, or remote asset is allowed.
- Task `12.2.2` installed the deterministic replacement family as runtime truth: 17 approved sources produce 28 closed derivatives through the safe-SVG, hash, inventory, accessibility, and provenance controls without weakening merchant-logo ownership, media lifecycle, fallback attribution, or accessible-name rules.

## Component and page states

- The anti-drift inventory is the reachable template component set plus current production owners. Only demonstrably consumed components may migrate; every `excluded-unreachable-generated-ui` record stays excluded. A genuinely new component requires one owner, import path, public props/states, and a one-line insufficiency finding for the existing inventory.
- Task `12.2.3` closes its 187 assigned obligations through `src/components/ui/inventory.json`: 20 reachable template sources map exactly once to production owners, while the 49 unreachable generated sources remain exclusions. `DataDirectory` is the sole owner for reachable table/filter responsibilities and canonical previous/next pagination; its client shell commits search, filters, and page size to the URL live (debounced search, on-change controls, geometry-preserving skeleton while pending), renders removable localized filter chips, and gives rows a clickable primary href alongside the explicit keyboard-reachable action, all over the native GET form with no parallel table/filter owner and no invalid-query render (invalid input redirects to the reset path with an informational notice instead); role-neutral compositions own copy, empty, localized-field, modal/confirmation, formatted-money, monogram, QR, tabs, skeleton, stat, status, timeline, and toast presentation. A genuinely new component whose template source is `excluded-unreachable-generated-ui` — such as the owned `ImageUploader` delivered by task `14.2.4` — is recorded in the inventory's `localAdditions` section (owner, public API, states, one-line insufficiency finding) and never enters `owners`, which stays exactly those 20 reachable sources.
- Components expose default, loading where applicable, empty where applicable, error with descriptive recovery, hover, visible focus, and disabled states; populated, invalid, active, selected, success, and confirmation states are added only where the control contract requires them.
- Data-driven pages cover ready, loading, empty, filtered-empty, unavailable, validation error, request error, success notice, retry, pending/disabled, and destructive confirmation when applicable. Checkout and recovery journeys also cover preparing, QR/copy, polling recovery, and every existing terminal state.
- A non-applicable state is documented, never fabricated. Loading preserves final geometry; empty is not an error; filtered-empty preserves reset; unavailable and request errors reveal no identity, submitted value, authorization cause, provider body, or internal detail.
- Status, active navigation, validation, selection, destructive meaning, and terminal outcomes always combine text/icon/shape or placement with color. Monetary values and provider-confirmed versus locally finalized facts remain separate exactly as their business specs require.

## Accessibility and motion

- WCAG 2.2 AA is required and overrides byte-identical rendering when the two conflict: normal text contrast at least 4.5:1, large text and essential non-text boundaries at least 3:1, semantic labels/descriptions, logical headings, keyboard operation, skip navigation, and no color-only meaning. The audit primitive remains exact evidence while the validated semantic projection is what users see.
- Every actionable target is at least 44×44 CSS pixels unless a larger template size is fixed. Focus uses the semantic template ring, visibly equivalent to a 3px ring, unobscured by sticky chrome and never removed without replacement.
- Dynamic success, copy, pending, and error feedback uses appropriate polite/assertive live semantics; disabled controls are distinct and unavailable actions are absent or explained rather than deceptively enabled.
- Full motion follows each hash-bound parity interaction and conveys no essential information. Under `prefers-reduced-motion: reduce`, non-essential animation and transition durations collapse to 0.01ms with one iteration; the resulting state remains complete and focused elements do not move unexpectedly.

## Evidence protocol

- Every route/component owner consumes the canonical parity obligation IDs and dispositions. `/store/[slug]` and `/store/[slug]/pay` use the authorized extrapolation: the same tokens, shells, components, states, and rules, without copying the template's incorrect slug-to-payment-link shortcut.
- Visual evidence uses repository Playwright `chromium`, Chromium, device scale factor 1, fixed fixture clock, locally settled fonts, disabled animations, hidden caret, and blocked external requests.
- Applicable surfaces cover `320x1000`, `375x1000`, `768x1000`, and `1440x1000`, both locales, all six themes, and every obligation-owned state. Pixel comparison uses threshold `0.1` and maximum differing-pixel ratio `0.001`.
- Geometry, typography, content, keyboard/focus, overflow, accessibility, console, request, and contract failures are independent of raster tolerance. Missing, stale, generic, duplicated, or source-divergent evidence fails closed.
- `/design-system` is the closed, role-neutral specimen for the shared foundation. `pnpm design-system:evidence:verify` accepts only its current run when the bound 48 locale/theme/viewport captures, 20 coverage entries, 101 applicable states, 72 explicit N/A states, interaction probes, and source hashes remain valid. `pnpm frontend-parity:check` validates the immutable parity authority, `scripts/check-shared-ui-inventory.mjs` validates shared ownership, exclusions, additions and focused dependencies, and `pnpm check` protects application behavior.

## Errors and limits

- Exact parity must stop if it would replace the fixed stack, weaken any existing role/owner/origin/rate-limit/redaction/exact-decimal/V1 compatibility rule, expose a secret or provider detail, or invent an unavailable projection or mutation.
- An unavailable licensed self-hosted font source or asset provenance record blocks only that asset integration lane; it never authorizes remote loading, silent substitution, or untracked bytes.

## Conformance criteria

- [x] `DESIGN.md` expresses this tone, numeric laws, state matrices, responsive compositions, inventory ownership, asset boundary, precedence, and evidence protocol without retaining the superseded visual direction.
- [x] The six stored themes and two locales remain exact, and DTCG semantics can represent every template palette, typography, elevation, focus, spacing, and motion role without component branching.
- [x] Every parity obligation has an owner/disposition, and authorized extrapolations preserve business/security contracts.
- [x] Accessibility, reduced motion, local fonts, deterministic assets, anti-drift inventory, and the complete specimen evidence matrix are objective gates.

## Out of scope

- Route-family migration and product-surface composition; the shared foundation and its closed specimen do not grant a product route new behavior or ownership.
- New backend/API/database behavior, Nautt-hosted links, new themes/locales, or changes to authorization, exact money, redaction, security guards, V1/V2 lifecycle, and media ownership.

## Related references

- [[specs/administrative-foundation|Administrative foundation]] — follow for roles, locale, shell capability, native mutations, and directories.
- [[specs/catalog-and-payment-links|Catalog and payment links]] — follow for owner scope, V1/V2 compatibility, exact composition, and link lifecycle.
- [[specs/checkout-and-order-lifecycle|Checkout and order lifecycle]] — follow for buyer data, exact money, retry/capability, polling, and terminal states.
- [[specs/storefront-and-customization|Storefront and customization]] — follow for theme IDs, branding, public projections, cart, and standalone payments.
- [[specs/identity-security|Identity security]] — follow for login, MFA, recovery, opaque outcomes, and secret handling.
- [[specs/media-storage|Media storage]] — follow for image provenance, ownership, safe formats, lifecycle, and reads.
- [[specs/nautt-finance-integration|Nautt Finance integration]] — follow for credential redaction, provider states, and webhook/payment boundaries.
- [`src/app-shell/AGENTS.md`](../../src/app-shell/AGENTS.md) — follow before implementing shell behavior.
- [`src/components/ui/AGENTS.md`](../../src/components/ui/AGENTS.md) — follow before changing shared visual source.
