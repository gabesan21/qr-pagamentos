# Spec - Administrative design system

- **Project:** [[PROJECT|QR Pagamentos]]
- **Epoch/Phase:** [[roadmap/1-administrative-foundation|Phase 1.4]]
- **Status:** implemented
- **Created:** 2026-07-16

## What it is

This spec defines the owned visual foundation for the login and administrative
surfaces delivered in Epoch 1. It refines the existing `PIX ledger` direction
into a professional shadcn-based source system without designing catalog,
checkout, storefront, or payment-provider surfaces.

## Requirements

- The system keeps one named direction, `PIX settlement desk`: a role-neutral
  operational workspace grounded in PIX receipts, QR alignment, cashier
  terminals, ruled hierarchy, factual status, and explicit feedback.
- The implementation initializes shadcn through its official registry with a
  pinned CLI, configuration, direct dependencies, and lockfile. Added
  components are owned source under one shared component subtree.
- The initial inventory is limited to the components needed by current Epoch 1
  surfaces: button, field/input, native select, checkbox, card, alert, badge,
  separator, skeleton, table, and loading indicator or equivalent compositions.
- Epoch 1 application surfaces consume owned sources directly; compatibility
  adapters and page-local visual variants are absent after migration.
- Reference values live only in the designated token source. Semantic tokens
  cover surfaces, text, borders, actions, feedback, focus, spacing, typography,
  radius, shadow, motion, and layer roles; components never select raw colors.
- Exactly six stable mappings (`pix-paper`, `cashier-daylight`,
  `settlement-sand`, `midnight-clearing`, `vault-blue`, `terminal-amber`) use
  identical semantic paths, three light and three dark. Light and dark mappings
  preserve role hierarchy and pass WCAG 2.2 AA contrast:
  4.5:1 for normal text, 3:1 for large text and essential non-text boundaries.
- Typography uses a pinned, self-hosted IBM Plex Sans variable package. Builds
  and rendered pages require no remote font request, and numeric facts use
  tabular figures.
- Product UI uses a fixed, restrained type scale, labels above controls, prose
  no wider than 65-75 characters, visible two-pixel-or-stronger focus, and touch
  targets at least 44 by 44 CSS pixels where applicable.
- One original, non-scannable settlement mark owns the closed mark, product,
  compact role-shell, and merchant-fallback family. Inline variants share
  canonical geometry and semantic foreground across all six themes; fixed
  positive/reversed files exist only for static consumers.
- A versioned provenance/usage manifest binds each derivative's role, source,
  path, MIME, dimensions, modes, generation status, and SHA-256. Checks reject
  unsafe SVG, unknown/duplicate/drifted outputs, and incomplete 16/32/48 icons.
- Lockups use reviewed outlines from pinned licensed IBM Plex Sans bytes, with
  no live font dependency. Adjacent marks are decorative; standalone marks have one caller-supplied localized name.
  Fallback never implies merchant ownership or creates image capability.
- Every applicable component documents and demonstrates default, hover, focus,
  active, disabled, loading, empty, and error states. Non-applicable states are
  recorded rather than simulated.
- `/design-system` is the authoritative bilingual-compatible specimen and uses
  the same shared sources as production surfaces. It introduces no alternate
  locale route or page-local component variants.
- The specimen has no horizontal overflow at 320 CSS pixels and has browser
  evidence at widths 320, 375, 768, and 1440 in all six themes.
- Every evidence run creates a new run identifier and binds the 24 fresh PNG
  hashes, browser assertion results, and visual review to that identifier; stale
  captures or a review of another manifest fail validation.
- Browser assertions verify at every width/theme that applicable interaction
  targets are at least 44 by 44 CSS pixels, computed body type is IBM Plex Sans,
  each specimen section has at most one primary action, status meaning has a
  visible non-color cue, and marked prose is no wider than 65ch.
- Browser verification blocks delivery if Chromium, screenshots, or automated
  accessibility checks cannot run. A source-only or no-capture fallback is not
  accepted.
- `DESIGN.md`, relevant DOX contracts, component tests, token lint, contrast
  checks, and browser checks remain synchronized with the shipped inventory.
- Shared visual sources grant no cross-role capability. Separate RSC adapters
  compose an inert frame with official identity and five permitted routes; its
  only client boundary owns segment-safe active state and mobile disclosure.
- At 768 CSS pixels and below, one 44px disclosure replaces desktop navigation in the accessibility tree with the same links and logout. Active state has `aria-current`, a non-color cue, and a skip target.
- Evidence binds 48 base and two mobile-open captures, nested routes, accessibility, and a review with no unresolved severity 2+.

## Out of scope

- Recomposition of the login page belongs to
  [[1.4.3-redesign-login-experience]].
- Catalog, payment links, checkout, storefront, provider orders, and marketing
  presentation are outside Epoch 1.
- Theme-selection persistence, new locales, remote fonts, decorative motion,
  charts, and speculative components are excluded.

## Details

The color strategy is restrained: neutral surfaces carry the interface and
each personality reserves one controlled accent for primary action, selection,
and focus. Feedback roles retain independent success, warning, and danger
semantics and never rely on color alone. DTCG-shaped source tokens resolve
through one deterministic CSS projection; valid explicit identifiers win,
absent light/dark selection maps to `pix-paper`/`midnight-clearing`, legacy
aliases map to those defaults, and unknown identifiers fall back to
`pix-paper`.

Design-taste guidance is used only as a redesign audit and final anti-slop
preflight because its dashboard implementation guidance is explicitly out of
scope. The product register governs implementation: familiarity, density, and
consistent state behavior outrank marketing-page novelty.

## Implemented slice

- [[6.2.2-create-official-brand-assets]] (2026-07-24) — delivered the original four-identity family, deterministic SVG/PNG/ICO manifest, accessible composition, and bounded integrations.
- [[6.3.1-build-pagination-filter-table-foundation]] (2026-07-24) — added the role-neutral data-directory composition with native GET controls, canonical links, six states, responsive facts/table semantics, bilingual copy, and six-theme evidence. Registry preflight was network-blocked, so no source was duplicated.
- [[6.2.1-create-six-theme-design-system]] (2026-07-23) — delivered six PIX settlement desk personalities, a DTCG-shaped token graph, deterministic CSS, contrast/gamut/motion gates, safe fallbacks, and 24-capture evidence.
- [[1.4.2-rebuild-design-system-with-shadcn]] (2026-07-16) — initialized the
  pinned official shadcn `nova` preset with Radix base, local IBM Plex Sans,
  owned current-scope sources, deprecated single-source adapters, semantic
  light/dark tokens, and the unprefixed bilingual specimen. The production
  Playwright/axe runner binds eight responsive captures and objective assertions
  to a manifest and review; it rejects stale, external-font, overflow, contrast,
  target, focus, action-count, status-cue, and prose-width regressions.
- [[1.4.3-redesign-login-experience]] (2026-07-17) — recorded `/login` as a
  consumer of the existing source inventory: a restrained credential `Card`
  with `Field`/`Input`, destructive `Alert` recovery, and a page-local
  `Button`+`Spinner` submit control, with no page-specific variant, token, or
  adapter. A dedicated `pnpm login:evidence` runner binds eight light/dark
  responsive captures, keyboard traversal, 44px targets, label/autofill
  semantics, the generic recovery alert, and axe to a hashed manifest and
  review, verified by `pnpm login:evidence:verify`.
- [[1.4.4-refactor-admin-surfaces-onto-design-system]] (2026-07-17) — migrated
  `/admin` and the authenticated home directly onto the owned source inventory,
  decomposed the server-rendered administration surface into cohesive account,
  settings, locale, notice, navigation, and logout compositions, and removed
  every compatibility adapter and obsolete selector. Responsive ruled account
  sections, pending/disabled controls, empty/loading/recovery feedback, and
  inline demotion/disablement confirmation preserve the existing native POST,
  authorization, BRL/PIX, and bilingual contracts. `pnpm admin:evidence` binds
  authenticated light/dark captures at 320, 375, 768, and 1440 pixels to the
  objective source, accessibility, interaction, and manifest checks.
- [[1.4.5-audit-and-harden-epoch1-code-and-ui]] (2026-07-17) — replaced the
  login's detached mocked pending state with native-form submit observation,
  preserving `/login/submit` while proving click and Enter pending behavior in
  production Chromium. Fresh design-system, login, and authenticated-admin
  runs each bind eight light/dark responsive captures, objective keyboard,
  focus, target, overflow, font, request/error, and axe assertions, plus a
  manifest-hash-bound visual review with all S2-S4 findings resolved.

## Related specs

- [[specs/administrative-foundation|Administrative foundation]] - follow when a
  visual decision affects authentication, localization, or admin behavior.
- [`../AGENTS.md`](../../AGENTS.md) - follow when adding the shared shadcn subtree
  or changing the root application structure.
