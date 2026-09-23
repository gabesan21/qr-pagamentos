---
author: agent
date: 2026-09-23
status: active
---

# Epoch 15 — V2-only, PIX integrity and explicit checkout: closing report

> Basic report for the human: what was done, where the proof lives, how to
> test. The full per-item walkthrough is
> [[pop/notes/references/2026-09-23-epoch-15-human-verification-checklist|the human verification checklist]]
> — *follow it before merging*.

## Outcome

- **PR:** not opened — the merge from `develop` to `main` is **suggested**,
  never opened by the agent. This task is not yet integrated into `develop`
  itself (branch `task/15.4.3-phase-verification`); the orchestrating
  session integrates it and only then can the epoch's `develop` → `main` PR
  be opened.
- **Scope delivered:** all 4 phases of
  [[pop/roadmap/15-v2-only-pix-integrity-and-explicit-checkout|Epoch 15]],
  each closed with PR merged into `develop` and a memory ledger under
  `pop/memory/2026-09-22/` and `pop/memory/2026-09-23/`.
- **This task's gate on this worktree (branch base `a20fda17`, commit(s)
  below):** `tsc --noEmit` exit 0; `pnpm lint` 0 errors/54 warnings;
  `vitest run` 2179 passed/28 skipped/0 failed; `next build` exit 0;
  `admin:contract-check` and `design-system:source-check` exit 0;
  `frontend-parity:check` `FRONTEND_PARITY_OK records=2226`, 27/27 semantic
  mutation probes green; `admin:source-check` fails widely (pre-existing,
  see follow-ups) — **not** a Phase 15.4 regression.

## What changed, per phase

- **15.1 — V1 removal:** the legacy V1 checkout/order stack (four tables,
  routes, dictionary keys, parity records) retired; the tree became
  V2-only. Repaired a residual `tsc` gap (spun off as 15.1.6) and a
  self-inflicted parity desync in round 1 of its own verification.
- **15.2 — PIX integrity:** non-destructive reconciliation merge, a
  deterministic fail-closed refusal taxonomy on documented creation
  errors, exactly one `POST /orders/onramp` per attempt, redacted
  provider-failure logging, and the public checkout/status DTOs trimmed of
  `pixQrCodeUrl`; the owner's order detail gained an explicit
  `paymentMethod`.
- **15.3 — Explicit checkout:** public checkout collapsed to explicit
  named states (no silent retry), the customer-data block renders only
  when the policy actually requires it, and the checkout/standalone
  surfaces converged on the shared state machine and QR treatment.
- **15.4 — Visual drift sweep:** the legacy shadcn vocabulary
  (`text-muted-foreground`, `bg-card`, `rounded-lg`, …) renamed
  value-identically to the declared template utilities across 47 files
  (merchant/admin/shell families; storefront `src/app/store/**` stays on
  its own unmapped vocabulary by design); three sub-44px interactive
  targets raised to the 44×44 minimum; 117 unreferenced dictionary keys
  retired with a plural product-count pair; the parity checker's semantic
  derivation bound to the git-tracked tree (closing a gap where a
  gitignored generated Prisma client could bake into tracked obligations).

## How to test on your side

1. `pnpm install --frozen-lockfile` with the pinned Node (`.node-version`).
   On a newer Node the deps check may misbehave; the direct-binary
   equivalents are `./node_modules/.bin/tsc --noEmit`,
   `./node_modules/.bin/eslint .` (via `pnpm lint`'s chain),
   `./node_modules/.bin/vitest run`, `./node_modules/.bin/next build`.
   A fresh worktree needs `SHARP_IGNORE_GLOBAL_LIBVIPS=1 pnpm install
   --frozen-lockfile` (prebuilt `sharp` binary, see
   [[pop/notes/references/limites-de-verificacao|verification limits]]).
2. `pnpm check` (the `tests/merchant-dashboard.evidence.spec.ts` lacuna
   found during this task's first pass is already repaired, below).
3. Docker-driven evidence and database/install checks: the full list with
   commands is in the checklist note.
4. Browser pass: run the app and walk the checklist note by area — public
   checkout, standalone payment, merchant/admin surfaces touched by the
   vocabulary migration — in `pt-BR` and `en`.
5. Merge the PR (once opened) when the checklist has no severity ≥ 2
   finding.

## Fixed during this task

- **`tests/merchant-dashboard.evidence.spec.ts` `tsc` failure** — it
  asserted `dictionary.merchantDashboardSalesEmpty` and
  `.merchantDashboardLinksEmpty`, both retired by 15.4.2's dictionary-debt
  sweep; genuinely falsified by the phase's own diff. `owns` was widened
  for this one file (`2d92f612`): the sales-empty assertion now reads
  `dictionary.merchantDashboardNoSales` (the real key the UI uses,
  confirmed at `dashboard.tsx:132,136,512,513`); the links-empty assertion
  was removed outright (no current equivalent — the dashboard only shows
  an active-links stat count). `tsc --noEmit` and `vitest run` (2179
  passed / 28 skipped) both confirmed green afterward.

## Known follow-ups (not blocking, not fixed here)

- **`admin:source-check` fails widely and predates this epoch's phases** —
  dozens of `raw_controls` (native `<button>`/`<input>`/`<select>`) and
  `local_variants` (BEM/CSS-var classNames) findings across
  `src/app-shell/**`, `src/app/admin/**` and `src/app/(merchant)/**`.
  15.4.1's F03 resolved exactly three named items (the account-panel
  `Button` composition, the `NativeSelect` in `language-switcher.tsx`, the
  account-panel/accent-style gate exemptions) — it never claimed to sweep
  the rest, and 15.3.4 already recorded this gate as "rooted in 15.1.4,
  not a Phase 15.3 defect" (its F6). It is not a Phase 15.4 regression
  either — none of the newly-failing files were touched by 15.4.1/15.4.2.
  Composing owned `Button`/`Input`/`NativeSelect` primitives across this
  many unrelated files is a real, separate modification-or-roadmap-sized
  effort, out of every phase-verification task's reach (product-code
  edits are `must_not_edit` here).
- **`NativeSelect` possible double chrome in `language-switcher.tsx`**
  (flagged by 15.4.1, carried forward) — needs a rendered look, not a
  guess; see the checklist note for the static read that motivates it.

## Verification stance

This report and its companion checklist were produced by
`pop-phase-verifier` reading the integrated 15.4.1→15.4.2 diff
(`git diff 4881b0b3^..a20fda17`) and running the phase's own suite via
direct binaries — never through Docker, never via a migration, never
touching webhook code or Nautt secrets.
