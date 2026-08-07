# Weekly review — 2026-08-01

## Scope and evidence

Review target: the included project harness in `pop/` and the DOX tree.

- `python3 pop/scripts/pop_status.py` — kanban empty; no active cards or human gates.
- `python3 pop/scripts/pop_validate.py` — no violations after corrections.
- `python3 pop/scripts/pop_install_included.py --check-fresh .` — harness version `c94bfca95865` installed.
- Subagent fronts: base files (AGENTS.md, PROJECT.md), DOX/specs audit, notes/memories/roadmap health, epochs/modifications, worktrees/yolo/gate-adversarial debt.

## Awaiting you

Open questions still `status: aberta`:

1. [[open_questions/2026-07-25-pre-production-gate-restore-webhook-hmac|Restore webhook HMAC before production]] — since 2026-07-25. Blocks production release.
2. [[open_questions/2026-07-26-v1-settle-wiring-gap|V1 settle wiring gap]] — since 2026-07-26.
3. [[open_questions/2026-07-17-entrega-yolo-qr-pagamentos-epoch-1|Yolo delivery Epoch 1]] — since 2026-07-17.
4. [[open_questions/2026-07-18-entrega-yolo-qr-pagamentos-epoch-2|Yolo delivery Epoch 2]] — since 2026-07-18.
5. [[open_questions/2026-07-20-entrega-yolo-qr-pagamentos-epoch-3|Yolo delivery Epoch 3]] — since 2026-07-20.

No cards await plan approval (003), merge (005), or unblock.

## Adjusted in this review

Harness próprio corrections:

- `AGENTS.md` — reduced to 59 lines; moved the "Processo DOX" section to [[notes/dox-contract-guide|DOX contract guide]]; compressed `Workflow` and `Essential rules`.
- `pop/notes/dox-contract-guide.md` — created from the DOX section extracted from `AGENTS.md`.
- `pop/PROJECT.md` — updated `Current state` to 2026-07-31 (Epochs 1–11 delivered, PR #9 merged); fixed `[[ROADMAP|Roadmap]]` and `[[../AGENTS.md|project AGENTS]]` links.
- `pop/ROADMAP.md` — Epoch 11 status `pendente` → `concluída`.
- `pop/roadmap/8-commerce-v2-and-merchant-operations.md`, `pop/roadmap/9-public-storefront-and-checkout.md`, `pop/roadmap/10-administrative-operations.md` — release gate text updated to "PR #9 merged on 2026-07-31".
- `pop/notes/decisions/2026-07-14-installer-simplification.md` — marked `status: resolved`; delivery confirmed in `memory/1.1.3-containerize-self-hosted-runtime`.
- `pop/researches/nautt-finance/nautt-finance.md` — removed obsolete `> Contradiz:` block about pricing boundary.
- `pop/RESEARCHES.md` — updated `nautt-production-webhook-hmac-contract` status; task 2.3.1 is delivered, research resumes with M-5.1 reversal.

DOX child-contract corrections:

- `prisma/AGENTS.md` — fixed broken link `../specs/administrative-foundation.md` → `../pop/specs/administrative-foundation.md`.
- `src/checkout/AGENTS.md` — added `Related contracts` and `Verification` sections.
- `src/components/ui/AGENTS.md` — expanded scope to catalog/checkout/storefront/merchant surfaces; added `Related contracts` and `Verification`.
- `src/integrations/nautt/AGENTS.md` — reduced to 60 lines; compressed BETA(M-5.1) override to a pointer.

Memory health corrections:

- `pop/memory/2026-07-27/10.3.3-build-admin-user-profile-editor.md` — 1208 → 1108 bytes.
- `pop/memory/2026-07-28/11.1.3-implement-totp-security-lifecycle.md` — 1208 → 1154 bytes.
- `pop/memory/2026-07-31/11.2.2-verify-six-theme-bilingual-experience.md` — 1208 → 1055 bytes.
- `pop/memory/2026-07-31/11.2.3-rehearse-production-upgrade-and-recovery.md` — 1202 → 1161 bytes.

## Stopped or at risk

- No active tasks, blocked cards, orphan worktrees, or yolo orphan branches.
- `develop` is at `b1fc714`; `main` is 3 commits ahead after PR #9 merge.
- Epoch 0 (Maintenance) remains continuous; no tasks currently reside there.
- Five open questions remain open; the three Epoch 1–3 delivery questions may be stale now that the work is integrated.

## Progress since the last review

The 2026-07-21 review proposed:

1. Fix dead spec link in `prisma/AGENTS.md` — done.
2. Refresh `AGENTS.md` and the UI contract — done.
3. Reconcile catalog/lifecycle specs — already aligned; no change needed.
4. Update `PROJECT.md` — done.
5. Update `RESEARCHES.md` and mark installer simplification resolved — done.
6. Optimize large memories — four recent ledgers enxugados; legacy flat memories remain tolerated.

Additional progress:

- PR #9 (`develop` → `main`) merged on 2026-07-31.
- Epoch 11 marked complete.
- `pop_validate` passes after all harness edits.

## Proposals

### P0 — Promote M-5.1 reversal to a roadmap epoch

The webhook-HMAC reversal is no longer a hotfix; it is the production release gate. Consider creating Epoch 12 (e.g., "Pre-production hardening") with a phase for restoring HMAC verification. Use `plan-roadmap` if you accept.

### P1 — Close stale yolo delivery questions

Questions for Epochs 1–3 yolo delivery remain `aberta` despite the work being delivered and merged. Mark them `respondida` or archive them.

### P2 — Remove gate-adversarial debt mechanism

Measurement found `GATE_ADVERSARIAL_SINCE = "2026-07-27"` and zero pre-cutoff cards across the kanban. Propose removing the transitional clause from `[[WORKFLOW|WORKFLOW]]`, the constant/isenção from `pop/scripts/pop_validate.py`, and the covering tests. This is harness gerido; execute through harness reinstallation from upstream.

### P3 — Decide legacy memory conversion policy

88 flat memory files dated before 2026-07-27 remain in the old layout. The `optimize-memory` skill treats them as tolerated legacy. Decide whether to convert them retroactively or keep the tolerance.

### P4 — Improve backlink discovery

`pop/notes/weekly-review-2026-07-21.md` has only one incoming link. Link it from `AGENTS.md` or a decisions index so the historical review trail is easier to follow.

---

Sources: `pop/scripts/pop_status.py`; `pop/scripts/pop_validate.py`; `pop/scripts/pop_install_included.py --check-fresh .`; subagent reviews of AGENTS/PROJECT, DOX/specs, notes/memories, epochs/modifications, worktrees/yolo/gate-adversarial debt; `optimize-memory` ledger enxugamento.
