---
author: agent
created: 2026-09-24
---

# Epoch 13 — human verification checklist

Consolidates every `verify: user` item across Phases 13.1-13.3
(webhook trust restoration, lifecycle release blockers, deployment truth and
release gates) into one pass, plus the permanent Docker-exclusive project
checks. All Docker/production-only commands are **user-exclusive**; the agent
never ran them. Phase 13.2's own five items (criteria 14-17, 10b) were already
consolidated at
[[pop/notes/references/2026-09-23-phase-13.2-human-verification-checklist|the 2026-09-23 note]]
and are only indexed here, not duplicated.

## Phase 13.1 — webhook trust (production-only)

- **13.1.1 C8** — The first production deliveries are accepted (`204`) and no
  `webhook.rejected` record appears in the container logs. **Check:** human
  checklist on the first production deployment (Docker-dependent,
  user-exclusive). **Pass:** zero `401` rejection records for genuine Nautt
  deliveries.

## Phase 13.2 — lifecycle release blockers

See [[pop/notes/references/2026-09-23-phase-13.2-human-verification-checklist|the 2026-09-23 checklist]]
for the full text and evidence of:

- **13.2.1 C8/C9** (there: criteria 14/17) — deactivate × reservation race on
  a disposable `pnpm db:test` fixture; rendered `/pay/[identifier]` capture of
  the buyer-facing deactivation state.
- **13.2.2 C10** (there: criterion 15) — clean install with a loopback origin
  guard, unset then `ALLOW_LOOPBACK_OPERATOR_ORIGINS=1`, plus a real-host
  install; `install/test.sh` green.
- **13.2.3 C9** (there: criterion 16) — encryption key rotation rehearsal on a
  disposable install: rotate both keys, log in with TOTP, read a Nautt
  credential, no key material in any log.
- **Criterion 10b** — `pnpm container:contract-check`'s Docker+network digest
  half, moved out of 13.2.4 (registry-drift risk, not a Phase 13.2 defect).

## Phase 13.3 — deployment truth and release gates

- **13.3.2 C8** — The shell footer and locale line render unchanged after the
  inert `app-shell__footer-locale` class removal. **Check:** open the shell
  at 1280px and 375px. **Pass:** no visual difference from before the task.
  (This task's own A10 confirmed statically that every remaining shell class
  still resolves to a backing `app-shell.css` rule and no markup/copy moved;
  a rendered look is still needed to close this row.)
- **13.3.3 #10** — The rehearsal is actually executed and recorded. **Check:**
  run [[docs/release-rehearsal.md|the release rehearsal protocol]] (blocks
  A/B/C) on a host with Docker, per its own operator-owned steps A1-A8,
  B1-B5, C1. **Pass:** a dated section of `docs/release-evidence.md` filled
  with PASS rows for blocks A/B/C, or a recorded FAIL with its stop decision.

## Permanent Docker-exclusive project checks

Not phase-scoped `verify: user` items, but standing project boundaries the
agent never crosses (`AGENTS.md` "Essential rules"): `pnpm db:test`,
`pnpm container:*`, `install/test.sh`, and every compose-driven exercise stay
user-run, on request or as part of the rows above.

## Close-out

Run `pnpm check` at the repository root on integrated `develop` before
opening the `develop` → `main` scope-closing PR (suggested only, never opened
by the agent); review and merge the PR yourself.
