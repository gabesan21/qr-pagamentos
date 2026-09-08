# Epoch 14 - Template fidelity convergence

- **Project:** [[PROJECT|QR Pagamentos]]
- **Roadmap:** [[ROADMAP|Roadmap]]
- **Status:** em andamento
- **Description:** Converge every application surface onto the supplied template's interaction model, vocabulary, compositions and states, functional defects first.
- **Yolo:** sim — user command 2026-09-07 ("faça tudo o que precisa fazer em yolo mode, deixe o sistema funcional").
- **Pause if:** convergence would require replacing the fixed Next.js stack, weakening authorization/security/redaction/exact-decimal contracts, or a phase gate cannot pass `pnpm check` via direct pnpm.

## Recon and forks

- [[researches/template-fidelity-convergence/template-fidelity-audit|Template fidelity audit]] - verdict, root causes, fidelity matrix; family files linked from it are the per-page source for every task below.
- [[researches/frontend-template-remodel/frontend-template-remodel|Epoch 12 recon]] - stack, business and public-route boundaries that remain authoritative.
- [[notes/decisions/2026-09-07-template-convergence-decisions|2026-09-07 decisions]] - interaction model, theme persistence, checkout width, epoch order, verification route.
- [x] RECON RESOLVED 2026-09-07: evidence runners (`scripts/run-*-evidence.mjs`) require Docker compose → user-exclusive; agent verification is `pnpm check` plus component tests; rendered screenshots enter the human checklist.
- Fork: if a per-user theme needs a schema column, keep the cookie-based persistence and propose the column as a follow-up; never migrate inside a UI task.
- Fork: if a template interaction conflicts with an existing business/security/exact-decimal contract, preserve the contract and adapt presentation only.

## Phase 14.1 - Blocking functional defects

- **Status:** concluída
- **Description:** Make every template-designed action reachable and correct before any visual convergence.
- **Specs:** [[specs/catalog-and-payment-links|Catalog and payment links]], [[specs/storefront-and-customization|Storefront and customization]], [[specs/administrative-foundation|Administrative foundation]], [[specs/identity-security|Identity security]]

| Task | Description | Status |
|------|-------------|--------|

## Phase 14.2 - Template vocabulary, theme, feedback

- **Status:** concluída
- **Description:** Wire the template utilities and soft tokens into `@theme`, give authenticated surfaces a persisted theme switcher, mount toasts, and make locale switching return to the origin page.
- **Specs:** [[specs/application-frontend-system|Application frontend system]], [[specs/administrative-foundation|Administrative foundation]]

| Task | Description | Status |
|------|-------------|--------|

## Phase 14.3 - Client interaction layer under server-first

- **Status:** em andamento
- **Description:** URL-state filters and page size without Apply, row click, table skeletons, and mutations that stay on their page across every directory and detail.

| Task | Description | Status |
|------|-------------|--------|
| [[14.3.1-live-directory-toolbar-and-rows]] | `DataDirectory` filters/search/page size update the URL on change with transition skeletons, chips render everywhere, rows are clickable, invalid params are ignored with a toast; revise `src/data-directory/AGENTS.md`. · size: L | 004_processing |
| [[14.3.2-keep-mutations-on-page]] | Order comments/outcomes, link edits/lifecycle, category and product saves redirect back to the detail page with a toast and preserve input on failure. · size: L | 004_processing |
| [[14.3.4-phase-verification]] | Run `pnpm check`, add directory/mutation/contrast tests, repair what it catches; depends on all 14.3 tasks. · size: S | 001_initial_task |

## Phase 14.4 - Shell, authentication and administrator convergence

- **Status:** pendente
- **Description:** Reproduce template shell/menu/auth compositions and every administrator page per the admin family audit.

| Task | Description | Status |
|------|-------------|--------|
| `14.4.1-converge-shell-and-auth-pages` | Route title, `lg` rail breakpoint, monogram footer, storefront link, auth brand panel on the left with tagline/swatches, forgot-password, show/hide, 6-cell TOTP, distinct reset states, bilingual 404. · size: L | não iniciada |
| `14.4.2-converge-admin-dashboard-and-directories` | Segmented period control, 5/4/3 grid, delta chip, merchant-filtered links, orders/links directories with the template's filters and columns, single unified V1+V2 table. · size: L | não iniciada |
| `14.4.3-converge-admin-accounts-and-settings` | Create-account modal with status/generator/strength, tabbed account editor with segmented/grid/swatch controls, functional global payment settings, currency UUID columns, per-section banners. · size: L | não iniciada |
| `14.4.4-phase-verification` | Run `pnpm check`, add admin/shell tests, repair what it catches; depends on all 14.4 tasks. · size: S | não iniciada |

## Phase 14.5 - Merchant convergence

- **Status:** pendente
- **Description:** Reproduce dashboard, orders, links, catalog, settings and profile compositions, forms, lifecycle rules and states per the merchant family audits.

| Task | Description | Status |
|------|-------------|--------|
| `14.5.1-converge-merchant-dashboard-and-orders` | By-state/by-source chart, four inventory cards, clickable recent orders/products with ids, storefront banner, first-run state, provider/outcome filters, outcome editor with dialog and gating, comment composer. · size: L | não iniciada |
| `14.5.2-converge-merchant-payment-links` | Radio-card composition/type, searchable product lines with prices and running total, descriptions for every link, live preview, locked fields on edit, lifecycle guards, real orders summary, currency column and filters. · size: L | não iniciada |
| `14.5.3-converge-catalog-settings-profile` | Flat product form with state control and default currency, drag-drop uploader, inline category edit for all rows, theme swatches/layout segmented/color picker/logo uploader, Nautt validate/replace, template TOTP enrollment order with secret/download and regenerate confirm. · size: L | não iniciada |
| `14.5.4-phase-verification` | Run `pnpm check`, add merchant tests, repair what it catches; depends on all 14.5 tasks. · size: S | não iniciada |

## Phase 14.6 - Public checkout and storefront convergence

- **Status:** pendente
- **Description:** Eight outcome views, payment-phase handoff, branded V1, format validation, expiry, privacy modal, footer and language switcher; extrapolate to `/store/**`.

| Task | Description | Status |
|------|-------------|--------|
| `14.6.1-converge-public-checkout` | Merchant header and theme for V1, form yields to payment phase, format validation with masks, expiry/single-use badge, amount on submit, eight distinct outcome views, privacy modal, footer with language switcher, 560px single column. · size: L | não iniciada |
| `14.6.2-converge-storefront-and-standalone-pay` | Same header/rail, unavailable and error vocabulary, badge tones and footer as the checkout; retire `storefront-*`/`receipt-rail*` BEM. · size: M | não iniciada |
| `14.6.3-phase-verification` | Run `pnpm check`, add checkout/storefront tests, repair what it catches; depends on all 14.6 tasks. · size: S | não iniciada |

## Phase 14.7 - Proof and BEM retirement

- **Status:** pendente
- **Description:** Delete remaining route-scoped BEM CSS, refresh specs/DOX/DESIGN.md, and close with the full `pnpm check` plus the human rendered checklist.

| Task | Description | Status |
|------|-------------|--------|
| `14.7.1-retire-bem-and-refresh-contracts` | Remove `.admin-*`, `.merchant-dashboard__*`, `.checkout-*`, `.storefront-*`, `.auth-*` route CSS; align DESIGN.md, frontend spec and DOX contracts with the converged system. · size: M | não iniciada |
| `14.7.2-phase-verification` | Full `pnpm check`, evidence-runner human checklist, final PR `develop` → `main`; depends on all 14.7 tasks. · size: S | não iniciada |

## Dependency and parallel-wave map

- 14.1 first (functional). 14.2 after 14.1; 14.3 after 14.2 (needs toasts and tokens).
- 14.4, 14.5 and 14.6 run after 14.3 with disjoint route, dictionary and CSS write sets, at most three tasks at a time.
- 14.7 waits for every family and is the epoch's final gate; the `develop` → `main` PR opens there.
