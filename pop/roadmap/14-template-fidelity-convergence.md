# Epoch 14 - Template fidelity convergence

- **Project:** [[PROJECT|QR Pagamentos]]
- **Roadmap:** [[ROADMAP|Roadmap]]
- **Status:** pendente
- **Description:** Converge every application surface onto the supplied template's interaction model, vocabulary, compositions and states, proven by rendered comparison instead of source records.
- **Pause if:** convergence would require replacing the fixed Next.js stack, weakening authorization/security/redaction/exact-decimal contracts, or the rendered-parity harness cannot run without Docker.

> **Proposal drafted by the agent on 2026-09-07 from the fidelity audit; phases, order and yolo marking await the user's reaction (`plan-roadmap`).**

## Recon and forks

- [[researches/template-fidelity-convergence/template-fidelity-audit|Template fidelity audit]] - verdict, root causes, fidelity matrix and the decisions this epoch depends on; family files linked from it.
- [[researches/frontend-template-remodel/frontend-template-remodel|Epoch 12 recon]] - stack, business and public-route boundaries that remain authoritative.
- [ ] RECON NEEDED: the application can render every route with fixture data through direct pnpm, without Docker — check: task 14.1.1 proves a DB-less fixture mode or documents the user-run Postgres it needs.
- [ ] RECON NEEDED: template dev server runs from `docs/template/app` with its pinned lockfile — check: `npm ci && npm run dev` in 14.1.1 (user-run if network is required).
- [ ] RECON NEEDED: user decision on the interaction model (client URL-state + toasts over server data vs pure round-trips) — check: answer recorded in `notes/decisions/` before Phase 14.2 starts.
- [ ] RECON NEEDED: user decision on V2 checkout width (560px single column vs 1280px two-column) — check: recorded before Phase 14.6.
- Fork: if the interaction-model decision keeps pure round-trips, Phase 14.3 shrinks to theme provider + return-to-origin redirects + flash notices, and directory tasks in 14.4-14.6 keep the Apply toolbar.
- Fork: if the fixture mode is impossible without Docker, the rendered-parity gate becomes `verify: user` and the agent's gate falls back to DOM-structure snapshots from component tests.
- Fork: if Epoch 13 must ship first, its release evidence must state that frontend parity is deferred to this epoch.

## Phase 14.1 - Rendered-parity harness

- **Status:** pendente
- **Description:** Run template and application side by side on fixture data and make screenshot + DOM comparison the epoch's exit gate.
- **Specs:** [[specs/application-frontend-system|Application frontend system]]

| Task | Description | Status |
|------|-------------|--------|
| `14.1.1-run-template-and-app-on-fixtures` | Fixture mode or documented local DB for the app, template dev server, one script that serves both for capture. · size: M | não iniciada |
| `14.1.2-build-rendered-parity-capture` | Playwright capture of every template route × state × locale × theme × viewport on both sides, with a manifest of pairs. · size: L | não iniciada |
| `14.1.3-define-rendered-parity-gate` | Screenshot diff + DOM-structure diff with per-pair tolerance; supersede the source-record proof in the spec and `pnpm check` wiring. · size: M | não iniciada |
| `14.1.4-phase-verification` | Author/run the phase suite via direct pnpm and repair what it catches; depends on all 14.1 tasks. · size: S | não iniciada |

## Phase 14.2 - Token vocabulary and component families

- **Status:** pendente
- **Description:** Expose the template utilities in `@theme`, add soft feedback tokens, fix `text-accent`, and build the missing domain component families.
- **Specs:** [[specs/application-frontend-system|Application frontend system]]

| Task | Description | Status |
|------|-------------|--------|
| `14.2.1-wire-template-utilities-into-theme` | `bg-surface`, `text-text-2/3`, `rounded-card/pill`, `shadow-card`, `font-display/money`, `max-w-app/checkout`, `*-soft`, strong `accent`. · size: M | não iniciada |
| `14.2.2-build-domain-badge-and-qr-families` | Provider/LocalOutcome/LinkLifecycle/AccountState/EntityState badges, QR generation with identity cut, compact `CopyField`, `Monogram` 48. · size: M | não iniciada |
| `14.2.3-build-uploader-filterbar-datatable-parity` | `ImageUploader`, standalone `FilterBar` chips, `DataTable` row click + page numbers, `StatCard` sparkline; revise `src/data-directory/AGENTS.md`. · size: L | não iniciada |
| `14.2.4-phase-verification` | Author/run the phase suite via direct pnpm; depends on all 14.2 tasks. · size: S | não iniciada |

## Phase 14.3 - Client interaction layer under server-first

- **Status:** pendente
- **Description:** Theme provider on `<html>`, locale switch returning to origin, mounted toasts with flash notices, URL-state filters without Apply, mutations that stay on the page.

## Phase 14.4 - Shell, authentication and administrator convergence

- **Status:** pendente
- **Description:** Reproduce template shell/menu/auth compositions and every administrator page, state and confirmation per the admin family audit.

## Phase 14.5 - Merchant convergence

- **Status:** pendente
- **Description:** Reproduce dashboard, orders, links, catalog, settings and profile compositions, forms, lifecycle rules and states per the merchant family audits.

## Phase 14.6 - Public checkout and storefront convergence

- **Status:** pendente
- **Description:** Eight outcome views, payment-phase handoff, branded V1, format validation, expiry, privacy modal, footer and language switcher; extrapolate to `/store/**`.

## Phase 14.7 - Rendered parity proof and BEM retirement

- **Status:** pendente
- **Description:** Delete route-scoped BEM CSS, run the rendered-parity gate across all pairs, and close with `pnpm check`.

## Dependency and parallel-wave map

- 14.1 precedes everything: no family converges without a rendered gate to converge against.
- 14.2 and 14.3 may run in parallel after 14.1 (disjoint write sets: tokens/components vs providers/routes/shell).
- 14.4, 14.5 and 14.6 run in parallel after 14.2 and 14.3, at most three tasks at a time with disjoint route, dictionary and CSS write sets.
- 14.7 waits for every family; it is the epoch's final gate.
- The blocking defects listed in the audit are proposed as modification `M-8` and do not wait for this epoch.
