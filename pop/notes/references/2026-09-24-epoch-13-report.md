---
author: agent
date: 2026-09-24
status: active
---

# Epoch 13 — Pre-production hardening: closing report

> Basic report for the human: what was done, where the proof lives, how to
> test. The full per-item walkthrough is
> [[pop/notes/references/2026-09-24-epoch-13-human-verification-checklist|the human verification checklist]]
> — *follow it before merging*.

## Outcome

- **PR:** not opened — the merge from `develop` to `main` is **suggested**,
  never opened by the agent. This task's own worktree carries a diff (two new
  notes; no product/harness edit — no defect rooted in Phase 13.3's own diff
  needed repair); the orchestrating session integrates it, and only then can
  the epoch's `develop` → `main` PR be opened.
- **Scope delivered:** Phases 13.1-13.3 of
  [[pop/roadmap/13-pre-production-hardening|Epoch 13]], each closed with a PR
  merged into `develop` and a memory ledger under `pop/memory/2026-09-23/` and
  `pop/memory/2026-09-24/`. Phase 13.4 is **not** part of this hand-off (see
  below).
- **This task's gate on this worktree (branch base `d71749e9`):** `tsc
  --noEmit` exit 0; `pnpm lint` 0 errors/54 warnings; `vitest run` 254
  files/2261 passed/30 skipped/0 failed; `next build` exit 0;
  `admin:contract-check`, `design-system:source-check`,
  `frontend-parity:check` all exit 0; `pnpm db:contract-check` prints `PASS
  documentation-contract`; `admin:source-check` fails with 14 `raw_controls`
  findings — **pre-existing, not a Phase 13.3 regression** (see follow-ups).

## What changed, per phase

- **13.1 — Webhook trust restoration:** signature verification, owner
  binding and `401` return reversed the 2026-07-25 M-5.1 exception; every
  beta caveat left the contracts. Verified zero-diff by 13.1.3 (empty task
  branch, closed without a PR).
- **13.2 — Lifecycle release blockers:** `setActive(false)` now sweeps every
  `RESERVED` attempt to a fenced terminal state in the same transaction as
  the version CAS; a production origin guard requires an explicit operator
  allowance for a loopback `PUBLIC_ORIGIN`/webhook callback; the encryption
  keys gained a dual-key-window rotation procedure with a one-shot rewrap.
  Verified by 13.2.4 (four in-`owns` test repairs, `vi.stubEnv` and a
  `server-only` mock; one criterion split by lacuna to the human checklist).
- **13.3 — Deployment truth and release gates (this phase):**
  `docs/production-runbook.md`, `README.md`, `pop/PROJECT.md` and
  `docs/release-evidence.md` now describe the real 16-migration, V2-only
  deployment instead of the stale 19-migration baseline (13.3.1); the
  `admin:source-check` checker's allow-list was replaced by two
  rule-anchored typed exemptions and one inert shell class token was removed
  (13.3.2 — this closed **gate precision** for shell BEM/token classes, not
  the pre-existing `raw_controls` findings elsewhere, see follow-ups); a
  dated, repeatable release rehearsal protocol (blocks A/B/C) replaced the
  2026-07-31 static-review waiver, with an appended evidence template
  (13.3.3).

## How to test on your side

1. `SHARP_IGNORE_GLOBAL_LIBVIPS=1 pnpm install --frozen-lockfile` with the
   pinned Node (`.node-version` 26.4.0). On a newer Node (this run used
   26.10.0) the install and every `pnpm` command still worked directly —
   no fallback to direct binaries was needed this time.
2. `pnpm check` on integrated `develop` before opening the `develop` →
   `main` PR.
3. `pnpm admin:source-check` will still fail widely (pre-existing, see
   follow-ups) — this is expected, not a regression to chase before merging.
4. Docker-driven evidence, install/db checks and the release rehearsal
   protocol itself: the full list with commands is in the checklist note.
5. Merge the PR (once opened) when the checklist has no severity ≥ 2
   finding outstanding.

## Fixed during this task

Nothing — the phase battery passed every in-reach criterion on first
attempt; no assertion, script, doc or product line needed repair. This
task's own diff is limited to the two notes above plus this report.

## Lacunas found at A0 (checklist reconciliation)

- **13.1.1's human-checklist row is `C9` in its own ledger, not `#8`** — the
  forecast checklist's row label was off by the ledger's own numbering; the
  content (first production deliveries, Docker-dependent) is unchanged and
  carried correctly into the human checklist note under its plan's original
  `| 8 |` row (confirmed by reading the retrieved plan file at `bc115772`).
- **A2 (`admin:source-check` exit 0, all counters zero) does not hold** — see
  the follow-up below; this was never claimed by 13.3.2's own delivery
  (ledger: "criteria 1,6,7 ... deferred to 13.3.4" refers to running the
  gate, not to it turning fully green everywhere; its actual scope was
  shell-class hygiene + gate precision, matching the roadmap's Phase 13.3
  description only for the `local_variants`/shell-class dimension).

## Known follow-ups (not blocking, not fixed here)

- **`admin:source-check` still fails with 14 `raw_controls` findings** across
  `src/app-shell/shell-navigation.tsx`, `src/app-shell/shell-theme-picker.tsx`,
  `src/app/(merchant)/catalog/categories/category-row-actions.tsx`,
  `src/app/(merchant)/links/link-lines-editor.tsx`,
  `src/app/(merchant)/merchant-controls.tsx`,
  `src/app/admin/accounts/[id]/preferences-section.tsx`,
  `src/app/admin/accounts/[id]/storefront-section.tsx`,
  `src/app/admin/admin-controls.tsx`,
  `src/app/admin/settings/appearance-section.tsx`,
  `src/app/admin/settings/language-section.tsx`. This is the exact same
  pre-existing debt the Epoch 15 report already logged as a follow-up
  ("real, separate modification-or-roadmap-sized effort"); none of these
  files were touched by 13.3.1/13.3.2/13.3.3's own diff (confirmed by `git
  diff --stat` on each commit), so composing owned `Button`/`Input`/
  `NativeSelect` primitives across them is out of every phase-verification
  task's reach (product-code edits are `must_not_edit` here) and belongs to
  its own modification or roadmap item.
- **13.3.2 C8 (shell footer visual check) still needs a rendered look** — the
  static read (A10) confirmed every remaining shell class resolves to a
  backing `app-shell.css` rule and no markup/copy moved, but the human
  checklist keeps the row until someone opens the shell in a browser.

## Phase 13.4 is explicitly blocked

Phase 13.4 (provider configuration trust) is **not** part of this hand-off.
Per [[pop/roadmap/13-pre-production-hardening|the roadmap]], it is planned
from in-repo Nautt documentation only, with the `/exchange-currencies`
semantics for PIX/BRL pairs staying a standing research gap
(`nautt-exchange-currencies-contract` in `RESEARCHES.md`) that this task
cannot resolve or simulate. 13.4.1/13.4.2 remain open, tracked separately; if
13.4.2 closes after this task, it becomes the epoch's hand-off instead (per
the roadmap's own dependency note).

## Verification stance

This report and its companion checklist were produced by
`pop-phase-verifier` reading the integrated 13.3.1→13.3.3 diff (commits
`0b81b81f`, `3033a842`, `502390ca` against their parents) and running the
phase's own suite via direct `pnpm` — never through Docker, never via a
migration, never touching webhook code or Nautt secrets. No PR was opened.
