---
author: agent
date: 2026-09-09
status: active
---

# Epoch 14 — template fidelity convergence: closing report

> Basic report for the human: what was done, where the proof lives, how to test. The full per-item walkthrough is [[pop/notes/references/2026-09-08-epoch-14-human-verification-checklist|the human verification checklist]] — *follow it when doing the browser pass before merging*.

## Outcome

- **PR:** https://github.com/gabesan21/qr-pagamentos/pull/11 (`develop` → `main`). The merge is yours; the agent does not merge.
- **Scope delivered:** all 7 phases of [[pop/roadmap/14-template-fidelity-convergence|Epoch 14]] (25 tasks), each judged at `005_closing` by reading, integrated into `develop`, with a memory ledger under `pop/memory/2026-09-08/` and `pop/memory/2026-09-09/`.
- **Root gate on integrated `develop` (f258554b):** `tsc` 0 · lint 0 errors (62 pre-existing warnings) · `vitest` 2228 passed / 0 failed / 28 skipped (from 1981 at the start of the epoch) · `next build` OK · design-system and login evidence verified.

## What changed, per phase

- **14.1** — functional defects fixed first (catalog lifecycle, settings return targets, admin drill-downs and confirmations), form draft restore on failure.
- **14.2** — template vocabulary wired into `@theme inline` (surfaces, text tones, soft/on-soft tokens, radii, shadows, widths), persisted theme cookie stamping `data-theme`, toast viewport, locale/notice bridges.
- **14.3** — client interaction layer under server-first: URL-state filters without "Apply", row click, skeletons, on-page mutations with toasts, domain badges.
- **14.4** — shell, authentication and administrator pages converged (rail/menu, `AuthCard`, OTP cells, admin directories and details).
- **14.5** — merchant dashboard (period control, charts, stat cards), orders, payment links (era partition, composition form, exact BigInt money), catalog, settings workspace, profile and TOTP enrollment.
- **14.6** — public checkout on one 560px branded shell with a shared state machine, eight outcome views and QR identity centre-cut; storefront and standalone pay reuse it.
- **14.7** — the parallel BEM CSS system retired from `globals.css` (81 rule-lines) with a regression pin; specs, `DESIGN.md` and DOX describe a single system; gap ledger in [[pop/researches/template-fidelity-convergence/convergence-outcome|convergence-outcome]].

## How to test on your side

1. `pnpm install --frozen-lockfile` with the pinned Node (`.node-version`); then `pnpm check` (typecheck, lint, test, build). On a Node newer than the pin, pnpm's deps check may try to reinstall first; the equivalent is `./node_modules/.bin/tsc --noEmit`, `pnpm lint`'s chain, `./node_modules/.bin/vitest run`, `./node_modules/.bin/next build`.
2. Local evidence (no Docker): `node scripts/verify-design-system-evidence.mjs` and `node scripts/verify-login-evidence.mjs` verify the committed runs offline.
3. Docker-driven evidence (yours only, 17 pairs): each `pnpm <area>:evidence` then `pnpm <area>:evidence:verify` — the full list with commands is in the checklist note, section "Docker-driven evidence".
4. Browser pass: run the app (`pnpm dev` or your compose stack) and walk the checklist note by family — authentication, shell, admin, merchant, public checkout/storefront, design-system — in `pt-BR` and `en`, light and dark, and at 320 px.
5. Merge the PR when the checklist has no severity ≥ 2 finding.

## Known follow-ups (not blocking)

Listed in the PR body and in the gap ledger: `.auth-brand` needs a `BrandIdentity` size prop before its rule can go; `check-admin-ui-inventory.mjs` never allowlisted the shell rail classes (since 14.4.1); `verify-brand-assets-evidence.mjs` has hardcoded counts (since 12.2.2); orphaned dictionary key `merchantDashboardSalesEmpty`; `receipt-rail` survivor deleted in 14.7.1; the no-JS checkout fallback is not possible with the JSON-only API.
