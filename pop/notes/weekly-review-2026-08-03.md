# Weekly review — 2026-08-03

## Scope and evidence

Review target: the included project harness in `pop/`. `pop_status.py`, `pop_validate.py`, and `pop_install_included.py --check-fresh .` were run on 2026-08-03; read-only subagent audits covered base files, specs sync, DOX contracts, notes health, memories/roadmap/modifications, epochs, yolo scope, and open questions.

## Awaiting you

1. **Open the final `develop` → `main` PR** for the accumulated yolo epochs. Three delivery questions remain `aberta`:
   - [[open_questions/2026-07-17-entrega-yolo-qr-pagamentos-epoch-1|Epoch 1 delivery]] (since 2026-07-17)
   - [[open_questions/2026-07-18-entrega-yolo-qr-pagamentos-epoch-2|Epoch 2 delivery]] (since 2026-07-18)
   - [[open_questions/2026-07-20-entrega-yolo-qr-pagamentos-epoch-3|Epoch 3 delivery]] (since 2026-07-20)
2. **Decide the production gate for webhook HMAC.** [[open_questions/2026-07-25-pre-production-gate-restore-webhook-hmac|Restore HMAC verification]] (M-5.1) is mandatory before release; awaiting explicit human command.
3. **Decide the V1 settle wiring gap.** [[open_questions/2026-07-26-v1-settle-wiring-gap|V1 orders never settle through webhook reconciliation]]; candidate for pre-production hardening.
4. **Decide the fate of Epoch 12.** Phases 12.1 and 12.2 are complete; 12.3–12.7 are pending. Either start `12.3.1` or close the current template-remodel scope.

## Stopped or at risk

- **Kanban is empty** — only `.gitkeep` files in all stages. No active task, claim, or blocked card.
- **`develop` is 20+ commits ahead of `origin/main`** (`342f8ea` vs `46aabb9`) with **no open PR** to `main`.
- **Harness is stale:** `pop/.included-harness.json` reports `b15d1f17eb6b ≠ origem bc17d7be1535` — `pop_validate.py` violation.
- **Root contract oversized:** `AGENTS.md` has 195 lines; the DOX section (155–186) duplicates generic DOX process, and the Application contract (74–153) is operational prose rather than an index.
- **Spec collection not canonical:** `pop/specs/INDEX.md` is missing; most specs lack the canonical frontmatter (`id`, `status`, `implementation` in English) and use Portuguese enums.
- **Wikilink rot:** many broken links in dated memories (`2026-08-02/`, `2026-08-03/`), old memories (`5.3.1`, `5.4.1`, `5.5.1`, `M-1.1`, `M-2.1`), `PROJECT.md`, and the previous weekly-review.
- **Stale notes:** `notes/decisions/2026-07-14-installer-simplification` references removed stages `005_verifying`/`006_done`; `researches/nautt-finance/nautt-finance.md` still records a pricing contradiction that the spec already resolved.

## Progress since 2026-07-21

- **Epochs 4–11 are now marked complete** in the roadmap; their memories are in `pop/memory/`.
- **Epoch 12 advanced:** phases 12.1 and 12.2 completed (`12.1.1`, `12.1.2`, `12.2.1`–`12.2.4` closed; last closeout commit `342f8ea`).
- **Memory compaction ran:** 25 memories were compacted to ≤2000 characters, saving ~15,376 characters (−24.1%). Four memories already fit the limit and were left intact.
- **No open questions were resolved** since the last review; the three yolo-delivery questions and two production blockers remain open.
- **Kanban remains empty** after closeouts; task-evidence retention model from the previous review is still the de-facto state.

## Proposals

### P0 — unblock delivery

- Test `develop` and open the final `develop` → `main` PR, then archive the three yolo-delivery questions.
- Schedule or command the reversal of M-5.1 (HMAC restoration) and decide whether to fix the V1 settle gap before production.

### P1 — repair harness and contracts

- Reinstall the included harness: `python3 pop/scripts/pop_install_included.py .`.
- Refactor `AGENTS.md`: replace the generic Workflow and DOX process prose with links to `[[WORKFLOW]]`/upstream DOX docs; keep only project-specific deltas; add `prisma/AGENTS.md` to the DOX index.
- Create `pop/specs/INDEX.md` and migrate specs to the canonical frontmatter (`id`, `project`, `domain`, `status`, `implementation`, etc.).

### P2 — hygiene and link rot

- Fix broken wikilinks in dated memories and old memories; repair `PROJECT.md` `[[AGENTS]]` links and the previous weekly-review links.
- Update `notes/decisions/2026-07-14-installer-simplification` and remove the resolved pricing contradiction from `researches/nautt-finance/nautt-finance.md`.
- Add `src/brand/AGENTS.md` parity-asset count correction: it says 17 assets, but `src/brand/template-asset-sources.ts` lists 18 `parityId` entries.

### P3 — next scope

- Either start `12.3.1-rebuild-role-specific-application-shells` or close Epoch 12 and document any unstarted phases as future candidates.
- Keep monitoring memory sizes as new tasks close; run `optimize-memory` whenever a memory exceeds 2000 characters.

## Collection notes

Sources: `python3 pop/scripts/pop_status.py`; `python3 pop/scripts/pop_validate.py --scope pop`; `python3 pop/scripts/pop_install_included.py --check-fresh .`; `git branch -a`; `git log --oneline -20`; `gh pr list --base main`; audits of `AGENTS.md`, `PROJECT.md`, `pop/specs/`, `pop/notes/`, `pop/memory/`, `pop/roadmap/`, `pop/open_questions/`, and `pop/worktrees/`.
