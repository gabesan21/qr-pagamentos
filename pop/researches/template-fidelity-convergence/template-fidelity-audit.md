# Template fidelity audit — overview and convergence plan

- **Date:** 2026-09-07 · **Trigger:** the user reported that the delivered frontend is far from the pages and functionality designed in `docs/template/` despite Epoch 12 being closed as complete.
- **Method:** five parallel read-only audits, one per route family, comparing `docs/template/app/src/**` and `docs/template/info.md` against `src/**` line by line. No browser or build run (`node_modules` absent); visual claims are marked UNVERIFIED in the family files.
- **Family files:** [[researches/template-fidelity-convergence/foundation-shell-auth|foundation, shell, theme/locale, auth]] · [[researches/template-fidelity-convergence/admin-area|administrator area]] · [[researches/template-fidelity-convergence/merchant-commerce|merchant dashboard, orders, links]] · [[researches/template-fidelity-convergence/merchant-catalog-settings-profile|catalog, settings, profile]] · [[researches/template-fidelity-convergence/public-checkout-and-inventory|public checkout, storefront, shared inventory]] — read the family file before planning any task in that family.
- **Predecessor:** [[researches/frontend-template-remodel/frontend-template-remodel|Epoch 12 recon]] — the original mapping; still valid for stack and business boundaries.

## Verdict

The route tree matches the template one-to-one (auth, 9 admin, 16 merchant, `/pay`, plus the extrapolated `/store/**`), fonts are self-hosted and the six palettes are largely byte-equal. Everything above that layer diverges: the template's **interaction model, component vocabulary, page compositions and state coverage were not reproduced**. Per-page fidelity is medium-low to low on 21 of 27 template pages; five functional defects make template-designed actions unreachable or broken.

## Root causes (why Epoch 12 closed "complete" while drifting)

1. **Parity was proven on source records, not on rendered pages.** `docs/frontend-template-parity/obligations.ndjson` binds 2225 hash records of class occurrences, states and interactions; `pnpm frontend-parity:check` validates the *authority*, not that production reproduces it. The `/design-system` specimen evidence covers the shared foundation only. No task ever rendered a production page next to the template page.
2. **The template's utility vocabulary was never wired into Tailwind 4.** `@theme inline` (`src/app/globals.css:1130-1165`) exposes shadcn names only; `bg-surface`, `text-text-2`, `rounded-card`, `shadow-card`, `font-display`, `rounded-pill`, `*-soft`, `max-w-app` do not exist as utilities. Pages were therefore rebuilt with shadcn tokens plus ~250 lines of route-scoped BEM CSS — a second visual system, exactly what the recon said to avoid.
3. **Server-first was read as "no client state".** The template filters, pages, switches period/theme/locale and shows toasts client-side over URL state. Production does every one of those as a GET/POST round-trip with Apply buttons, redirects to `/` or to directories, and query-string banners; `ToastViewport` is mounted only in the specimen. `src/data-directory/AGENTS.md` even forbids a `DataTable`/`FilterBar` owner.
4. **Theme switching was scoped to storefront/checkout only.** Nothing sets `data-theme` on `<html>` for authenticated surfaces (`src/app/layout.tsx:23`), so six themes are dead CSS for the shell.
5. **Domain badge families, status views and lifecycle rules were flattened** into one generic `StatusBadge` and one badge line per state, losing the template's eight checkout outcome views, lifecycle guards and tone mapping.

## Fidelity matrix

| Family | Pages | Fidelity | Blocking defects found |
|---|---|---|---|
| Foundation / shell / auth | shell, login, TOTP, reset, 404 | low-medium | no theme switching in app; account menu without sign-out and empty for admins; 404 pt-BR only |
| Administrator | 9 | medium-low | link detail → orders drill-down dead (`?link=`); delete / soft-delete / TOTP-disable without confirmation; global payment settings inert; `admin-dashboard__col--*` undefined |
| Merchant commerce | 10 | low-medium | dashboard rows dead (no ids); orders summary hardcoded 0; float subtotals; form failures drop input |
| Catalog / settings / profile | 6 | low | **product archive and activate/deactivate do nothing** (detached refs); settings saves redirect to `/`; `settings-surface__*` CSS absent; password change logs out |
| Public checkout / storefront | 4 | 4–5/10 | eight outcome states collapse to a badge; form keystroke wipes the issued QR; V1 unbranded; required-only validation |

## Recommended convergence epoch (proposed as Epoch 14)

Order matters: fix the foundation once, then converge families in parallel, then prove parity by rendering.

1. **Rendered-parity harness first.** Run the template (`docs/template/app`, Vite) and the application side by side with fixture data; capture both per route/state/locale/theme/viewport; the gate compares screenshots and DOM structure — not class-occurrence hashes. This replaces the source-level proof as the epoch's exit criterion.
2. **Token and vocabulary wiring.** Expose the template vocabulary in `@theme` (surface/text/accent/soft/danger/info, `rounded-card/pill`, `shadow-card`, `font-display/money`, `max-w-app/checkout`), add `*-soft` tokens, fix `text-accent`, then delete route BEM CSS as pages migrate.
3. **Client interaction layer under server-first.** Theme provider on `<html>` (persisted per user), locale switch that returns to the origin page, mounted toast viewport with flash notices, URL-state filters/period/pagination without Apply, mutations that stay on the detail page. Revise `src/data-directory/AGENTS.md` and the frontend spec accordingly.
4. **Domain component families.** Provider/LocalOutcome/LinkLifecycle/AccountState/EntityState badges, `ImageUploader`, `FilterBar` chips, `DataTable` row click + page numbers, `StatCard` sparkline, compact `CopyField`, `Monogram` 48, QR generation with identity cut.
5. **Family convergence (parallel, disjoint write sets):** shell+auth, admin, merchant commerce, catalog/settings/profile, public checkout/storefront — each reproducing the template compositions, states and the info.md functional list.
6. **Rendered parity proof and BEM retirement.**

## Defects that should not wait for the epoch (proposed modification)

Pinpoint, contract-neutral, each fits one card: product archive/activate refs; admin drill-down `?link=` → `filter.link`; settings/policy/language redirects back to `/settings`; destructive admin actions behind `ConfirmDialog`; account menu sign-out; `settings-surface__*` styles or removal. Proposed as `M-8` for the user to create.

## Decisions needed from the user

- Approve Epoch 14 and its position relative to Epoch 13 (pre-production hardening). Recommendation: 14 before 13, because 13's release evidence would otherwise certify the drifted frontend.
- Confirm the interaction model: template-faithful client-side URL state and toasts on top of server-rendered data (recommended), or keep pure round-trips and accept permanent divergence.
- Confirm that the rendered-parity harness may run fixture data locally via direct pnpm (a DB-less fixture mode or a user-run Postgres); Docker remains user-exclusive.
- Confirm V2 checkout width: template 560px single column (recommended) versus the DESIGN.md-sanctioned 1280px two-column.

## Unresolved checks

- [ ] UNVERIFIED: rendered effect of dead utilities (`not-found.tsx`, merchant h1, admin h2) and QR frame contrast on dark themes — resolved by the rendered-parity harness.
- [ ] UNVERIFIED: server-side guards for 128-char password cap and storefront enable without slug/names.
- [ ] Whether the `EMAIL`-only checkout policy (production extra) stays — business decision, not template.
