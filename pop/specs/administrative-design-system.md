# Spec - Administrative design system

- **Project:** [[PROJECT|QR Pagamentos]]
- **Epoch/Phase:** [[roadmap/1-administrative-foundation|Phase 1.4]]
- **Status:** approved
- **Created:** 2026-07-16

## What it is

This spec defines the owned visual foundation for the login and administrative
surfaces delivered in Epoch 1. It refines the existing `PIX ledger` direction
into a professional shadcn-based source system without designing catalog,
checkout, storefront, or payment-provider surfaces.

## Requirements

- The system keeps one named direction, `PIX ledger`: a restrained operational
  payment ledger with ruled hierarchy, factual status presentation, one teal
  action accent, graphite neutrals, and explicit feedback colors.
- The implementation initializes shadcn through its official registry with a
  pinned CLI, configuration, direct dependencies, and lockfile. Added
  components are owned source under one shared component subtree.
- The initial inventory is limited to the components needed by current Epoch 1
  surfaces: button, field/input, native select, checkbox, card, alert, badge,
  separator, skeleton, table, and loading indicator or equivalent compositions.
- Existing `ActionButton`, `Field`, `Panel`, and `Status` consumers may use
  temporary compatibility adapters only when each adapter delegates to the same
  shadcn source and introduces no parallel styling contract.
- Reference values live only in the designated token source. Semantic tokens
  cover surfaces, text, borders, actions, feedback, focus, spacing, typography,
  radius, shadow, motion, and layer roles; components never select raw colors.
- Light and dark mappings preserve role hierarchy and pass WCAG 2.2 AA contrast:
  4.5:1 for normal text, 3:1 for large text and essential non-text boundaries.
- Typography uses a pinned, self-hosted IBM Plex Sans variable package. Builds
  and rendered pages require no remote font request, and numeric facts use
  tabular figures.
- Product UI uses a fixed, restrained type scale, labels above controls, prose
  no wider than 65-75 characters, visible two-pixel-or-stronger focus, and touch
  targets at least 44 by 44 CSS pixels where applicable.
- Every applicable component documents and demonstrates default, hover, focus,
  active, disabled, loading, empty, and error states. Non-applicable states are
  recorded rather than simulated.
- `/design-system` is the authoritative bilingual-compatible specimen and uses
  the same shared sources as production surfaces. It introduces no alternate
  locale route or page-local component variants.
- The specimen has no horizontal overflow at 320 CSS pixels and has browser
  evidence at widths 320, 375, 768, and 1440 in both light and dark modes.
- Every evidence run creates a new run identifier and binds the eight fresh PNG
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

## Out of scope

- Recomposition of the login page belongs to
  [[1.4.3-redesign-login-experience]].
- Full admin information-architecture and page decomposition belongs to
  [[1.4.4-refactor-admin-surfaces-onto-design-system]].
- Catalog, payment links, checkout, storefront, provider orders, and marketing
  presentation are outside Epoch 1.
- Manual theme selection, new locales, remote fonts, decorative motion, charts,
  and speculative components are excluded.

## Details

The color strategy is restrained: neutral surfaces carry the interface and the
teal PIX accent is reserved for primary action, selection, and focus. Feedback
roles retain independent success, warning, and danger semantics and never rely
on color alone. Tokens follow reference, semantic, and component-consumption
layers in CSS; DTCG JSON export is not required for this web-only slice.

Design-taste guidance is used only as a redesign audit and final anti-slop
preflight because its dashboard implementation guidance is explicitly out of
scope. The product register governs implementation: familiarity, density, and
consistent state behavior outrank marketing-page novelty.

## Open

- Exact registry and package versions are resolved by read-only npm lookups at
  execution time and then committed as exact versions; planning network access
  was unavailable. The selected official named preset is `nova` and must resolve
  to base `radix` plus style `nova` before components are added.

## Related specs

- [[specs/administrative-foundation|Administrative foundation]] - follow when a
  visual decision affects authentication, localization, or admin behavior.
- [`../src/app/ui/AGENTS.md`](../../src/app/ui/AGENTS.md) - follow while replacing
  the legacy primitive implementation with single-source adapters.
- [`../AGENTS.md`](../../AGENTS.md) - follow when adding the shared shadcn subtree
  or changing the root application structure.
