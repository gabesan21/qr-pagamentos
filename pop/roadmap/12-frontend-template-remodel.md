# Epoch 12 - Frontend template remodel

- **Project:** [[PROJECT|QR Pagamentos]]
- **Roadmap:** [[ROADMAP|Roadmap]]
- **Status:** em andamento
- **Description:** Replace the complete application frontend with the supplied professional template while preserving the current Next.js stack and established business contracts.
- **Pause if:** exact visual parity would require replacing the fixed stack, weakening authorization/security/redaction/exact-decimal contracts, or using fonts/assets without an approved production source.

## Recon and forks

- [[researches/frontend-template-remodel/frontend-template-remodel|Frontend template remodel recon]] - maps the template, current route tree, visual contracts, stack differences, public-route gaps, and migration boundaries.
- [x] RECON RESOLVED: task `12.1.1-establish-template-parity-contract` fixed the screenshot-diff browser, viewport, tolerance, and independent assertion matrix.
- [ ] RECON NEEDED: confirm production provenance and self-hosting sources for Sora, Inter, IBM Plex Mono, the template logo, and its illustrations - check: inventory licenses and approved source files in task `12.2.2-reconcile-template-identity-and-assets` before runtime installation.
- Fork: if a template interaction conflicts with an existing business, ownership, security, or exact-decimal contract, preserve the current contract and plan the narrowest separately approved API change only when presentation-layer adaptation is proven insufficient.
- Fork: because the template omits `/store/[slug]` and `/store/[slug]/pay`, extrapolate those pages from the approved template tokens, components, responsive rules, and public-checkout language without copying the template's incorrect slug-to-payment-link shortcut.
- Fork: if the template identity assets are not approved to replace the canonical brand family, retain the current generated identity geometry inside the new layout and migrate only the surrounding visual system.

## Phase 12.1 - Template parity and application frontend contract

- **Status:** concluída
- **Yolo:** yes
- **Description:** Freeze the route, state, responsive, asset, and interaction reference that every later phase must reproduce in `pt-BR` and `en`.
- **Specs:** [[specs/administrative-design-system|Administrative design system]], [[specs/administrative-foundation|Administrative foundation]], [[specs/storefront-and-customization|Storefront and customization]]

| Task | Description | Status |
|------|-------------|--------|

## Phase 12.2 - Design system, identity, and shared components

- **Status:** concluída
- **Yolo:** yes
- **Description:** Rebuild the executable visual foundation before any product page migrates.
- **Specs:** [[specs/administrative-design-system|Administrative design system]], [[specs/media-storage|Media storage]]

| Task | Description | Status |
|------|-------------|--------|

## Phase 12.3 - Application shells and identity journeys

- **Status:** concluída
- **Yolo:** yes
- **Description:** Apply the template shell, navigation, authentication, and recovery experience without changing authorization or credential rules.
- **Specs:** [[specs/administrative-foundation|Administrative foundation]], [[specs/identity-security|Identity security]]

| Task | Description | Status |
|------|-------------|--------|
| [[12.3.2-remodel-authentication-and-recovery-pages]] | Reproduce login, MFA challenge, password reset, unavailable, pending, validation, and success states in `src/app/login/**` and `src/app/reset-password/**`. · size: L | concluída |
| [[12.3.3-phase-verification]] | Author/run the phase suite (accumulated `verify: phase` criteria) via direct pnpm and repair what it catches; depends on all 12.3 tasks. · size: M | concluída |

## Phase 12.4 - Administrator frontend

- **Status:** concluída
- **Yolo:** yes
- **Description:** Remodel every administrator page and state onto the new design system while retaining read-only and privileged-action boundaries.
- **Specs:** [[specs/administrative-foundation|Administrative foundation]], [[specs/catalog-and-payment-links|Catalog and payment links]], [[specs/checkout-and-order-lifecycle|Checkout and order lifecycle]], [[specs/identity-security|Identity security]]

| Task | Description | Status |
|------|-------------|--------|
| [[12.4.3-remodel-administrator-account-management]] | Match account creation, directory, profile editor, access, TOTP recovery, storefront settings, and deletion states under `src/app/admin/accounts/**`. · size: L | 001_initial_task |
| [[12.4.4-remodel-administrator-settings]] | Match all six settings sections, anchored navigation, forms, confirmations, dependency blocks, and notices under `src/app/admin/settings/**`. · size: L | concluída |

## Phase 12.5 - Merchant frontend

- **Status:** pendente
- **Yolo:** yes
- **Description:** Remodel every owner-scoped dashboard, commerce, catalog, settings, and profile journey onto the template interaction system.
- **Specs:** [[specs/catalog-and-payment-links|Catalog and payment links]], [[specs/checkout-and-order-lifecycle|Checkout and order lifecycle]], [[specs/storefront-and-customization|Storefront and customization]], [[specs/identity-security|Identity security]], [[specs/nautt-finance-integration|Nautt Finance integration]]

| Task | Description | Status |
|------|-------------|--------|
| [[12.5.1-remodel-merchant-dashboard]] | Match the template dashboard in `src/app/(merchant)/page.tsx` and `dashboard.tsx` while preserving existing analytics, period, currency, and storefront-link behavior. · size: L | concluída |
| [[12.5.2-remodel-merchant-order-management]] | Match owner order directories, V1/V2 details, comments, local outcomes, and unavailable states under `src/app/(merchant)/orders/**` and shared order views. · size: L | 001_initial_task |
| `12.5.3-remodel-merchant-payment-links` | Match link directories, create/edit/detail, lifecycle actions, sharing, versioning, and nested order drill-downs under `src/app/(merchant)/links/**`. · size: L | não iniciada |
| `12.5.4-remodel-merchant-catalog` | Match product/category directories, forms, localized content, media staging, lifecycle confirmations, and archived facts under `src/app/(merchant)/catalog/**`. · size: L | não iniciada |
| `12.5.5-remodel-merchant-settings-and-profile` | Match Nautt onboarding, checkout policy, storefront configuration, theme preview, logo, currency, language, identity, password, and TOTP under merchant settings/profile surfaces. · size: L | não iniciada |
| `12.5.6-phase-verification` | Author/run the phase suite (accumulated `verify: phase` criteria) via direct pnpm and repair what it catches; depends on all 12.5 tasks. · size: M | não iniciada |

## Phase 12.6 - Public storefront and checkout

- **Status:** pendente
- **Yolo:** yes
- **Description:** Extend the template language across every sessionless buyer surface while preserving public security, cart, and payment contracts.
- **Specs:** [[specs/checkout-and-order-lifecycle|Checkout and order lifecycle]], [[specs/storefront-and-customization|Storefront and customization]], [[specs/media-storage|Media storage]]

| Task | Description | Status |
|------|-------------|--------|
| [[12.6.1-remodel-public-payment-link-checkout]] | Match the template V1/V2 buyer flow, policy-specific forms, QR/copy, polling, retry, privacy, paid, unavailable, and terminal states under `src/app/pay/[identifier]/**`. · size: L | concluída |
| `12.6.2-remodel-public-storefront-and-cart` | Extrapolate the template faithfully across `/store/[slug]`, its boxed/table catalog, custom amount, cart, reconciliation, branding, and all loading/empty/error states. · size: L | não iniciada |
| `12.6.3-remodel-standalone-payment-journey` | Extrapolate the template faithfully across `/store/[slug]/pay`, preserving standalone order creation, exact money, buyer policy, QR, polling, retry, and terminal outcomes. · size: L | não iniciada |
| `12.6.4-phase-verification` | Author/run the phase suite (accumulated `verify: phase` criteria) via direct pnpm and repair what it catches; depends on all 12.6 tasks. · size: M | não iniciada |

## Phase 12.7 - Frontend convergence and parity proof

- **Status:** pendente
- **Yolo:** yes
- **Description:** Remove the superseded visual system and prove complete template parity without behavioral regressions.
- **Specs:** [[specs/administrative-design-system|Administrative design system]], [[specs/administrative-foundation|Administrative foundation]], [[specs/catalog-and-payment-links|Catalog and payment links]], [[specs/checkout-and-order-lifecycle|Checkout and order lifecycle]], [[specs/storefront-and-customization|Storefront and customization]], [[specs/identity-security|Identity security]]

| Task | Description | Status |
|------|-------------|--------|
| `12.7.1-retire-superseded-frontend-sources` | Remove obsolete CSS, visual assets, component variants, dictionaries, and adapters after every consumer migrates, leaving one documented source per frontend concern. · size: M | não iniciada |
| `12.7.2-prove-full-frontend-template-parity` | Verify every route/state in `pt-BR` and `en` across six themes and 320/375/768/1440 widths with visual, keyboard, WCAG 2.2 AA, contract, and `pnpm check` evidence — this task **is** the 12.7 phase-verification (and the epoch's final proof); all runs via direct pnpm. · size: L | não iniciada |

## Dependency and parallel-wave map

- 12.1.1 precedes 12.1.2; Phase 12.2 starts only after the parity and design contracts are fixed.
- Within Phase 12.2, token/typography and identity/assets may proceed in parallel across separate files; shared components follow stable tokens, and the specimen closes the phase.
- Phase 12.3 follows the shared foundation and stabilizes the authenticated composition before administrator and merchant route migration.
- Phases 12.4 and 12.5 may run independently after Phase 12.3, with at most three parallel tasks whose route, dictionary, and evidence write sets are disjoint.
- **Tests run once per phase:** ordinary tasks carry no test runs — their test criteria are `verify: phase` and accumulate for the phase's final `phase-verification` task (12.3.3, 12.5.6, 12.6.4; 12.7.2 plays that role for 12.7), which authors/runs the suite via **direct pnpm, never containers**, and repairs what it catches.
- Phase 12.6 may start after Phase 12.2, but checkout/storefront branding shares token, asset, dictionary, and evidence lanes that must serialize with overlapping work.
- 12.7.1 waits for all route consumers in Phases 12.3-12.6; 12.7.2 is the final gate after cleanup and all affected spec/DOX updates.
- No backend/API task is pre-authorized by this epoch; any proven gap returns to planning as the narrowest necessary contract change before implementation.
