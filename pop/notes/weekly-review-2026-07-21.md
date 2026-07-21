# Weekly review — 2026-07-21

## Scope and evidence

Review target: the included project harness in `pop/`. The status and strict
standalone validators passed on 2026-07-21. This is the first weekly-review
report found in the harness, so there is no earlier report to compare.

## Awaiting you

1. Decide the retention model for completed task evidence. Commit `b0e491e`
   removed the cards, plans, approvals, and verification files for the
   completed tasks; `pop/kanban/006_done/` now retains mostly empty folders.
   Consequently `python3 pop/scripts/pop_status.py` reports an empty kanban
   despite the roadmap and memories recording delivered work. Confirm whether
   this removal was intentional; if not, restore the evidence from its parent.
2. Test `develop` and decide the final delivery route for the completed yolo
   epochs. Locally, `main...develop` is `0 58`, while delivery questions for
   Epochs 1–3 remain open. Repository-local data cannot prove a remote final
   PR or its status. See [[open_questions/2026-07-17-entrega-yolo-qr-pagamentos-epoch-1]],
   [[open_questions/2026-07-18-entrega-yolo-qr-pagamentos-epoch-2]], and
   [[open_questions/2026-07-20-entrega-yolo-qr-pagamentos-epoch-3]].
3. Choose whether to materialize the next candidate, `4.3.1-owner-and-admin-order-views`.
   Epoch 4 is active but no active task card exists.

## Stopped or at risk

- No orphan worktree, active claim, blocked card, stale active card, or
  triggered epoch pause condition was found. `git worktree list` contains only
  the primary `develop` worktree and `pop/worktrees/` contains only `.gitkeep`.
- The lack of retained task cards is a traceability risk rather than evidence
  that the completed work is absent. Do not reconstruct or move cards during a
  review; resolve the retention decision above first.
- Local `task/*`, `roadmap/epoch-2-readiness`, and `yolo-integration-1.2.4`
  branches are all contained in `develop`. They are cleanup candidates after
  final-delivery decisions, not orphaned worktrees.

## Progress since the last review

No earlier weekly-review report exists. Current roadmap evidence records
Epochs 1–3 as complete, Epoch 4 phases 4.1 and 4.2 as complete, and only
phase 4.3 as not started. The harness has been migrated to the included layout
and the current `weekly-review` skill is present. Strict validation passes.

## Proposals

### P0 — resolve historical task-evidence retention

After the decision above, either recover the deleted completed-task artifacts
or explicitly document the compacted retention model and adapt reporting so an
empty kanban cannot be misread as an empty delivery history.

### P1 — repair contract and specification drift

- Fix the dead spec link in [[../prisma/AGENTS|prisma/AGENTS]]: it targets
  `../specs/administrative-foundation.md`, while the real document is
  [[specs/administrative-foundation]].
- Refresh [[../AGENTS|AGENTS]] and [[../src/components/ui/AGENTS|the UI contract]]
  so their scopes include current product, payment-link, and public-checkout
  use. The UI contract still describes only its Epoch 1 consumers.
- Reconcile [[specs/catalog-and-payment-links]] with
  [[specs/checkout-and-order-lifecycle]]. The catalog spec still calls binding,
  checkout, order creation, and confirmed-payment consumption future work;
  the lifecycle spec records them as delivered. Complete the lifecycle delivery
  ledger for tasks 4.1.1, 4.1.2, and 4.2.1.

### P2 — refresh project narrative and discovery

- Update [[PROJECT]]: it still says no application code exists and describes
  yolo task PRs that no longer match the mechanical `develop` integration flow.
- Update [[RESEARCHES]]: its webhook-HMAC blocker and task 2.3.1 replanning
  instructions are obsolete; mark the pricing-boundary proposal implemented.
- Update the parent category INDEX status from `planning` to `in progress`.
- Mark the temporary gate in
  [[notes/decisions/2026-07-14-installer-simplification]] resolved, because
  [[memory/1.1.3-containerize-self-hosted-runtime]] records its completed
  verification and delivery.

### P3 — low-priority hygiene

- Review the delivery questions for Epochs 1–2: their gate commits appear in
  `main`, so they may be ready to archive; Epoch 3 still needs a delivery
  decision. All six questions have no direct incoming wikilink, although the
  INBOX Dataview query surfaces open ones.
- Consider [[.agents/skills/optimize-memory/SKILL|optimize-memory]] for
  [[memory/1.4.5-audit-and-harden-epoch1-code-and-ui]],
  [[memory/2.3.2-recover-nautt-webhook-deliveries]], and
  [[memory/0.1.2-reset-nautt-credential-onboarding]]: each exceeds 2,000
  bytes and could lose narrative detail while retaining decisions and proof.
- Translate the Portuguese maintenance memories `0.1.1`, `0.1.2`, and `0.1.3`
  to English to meet the project-content language rule.

## Collection notes

No unsafe copied-skill drift was found. The meaningful differences from the
upstream core skills correctly adapt `scripts/` paths to this included
`pop/scripts/` layout; four runner-skill differences are newline-only. No
spec collection INDEX exists, so strict canonical-spec reachability is not
currently applicable. No `pop-hash` annotations were found.

Sources: `python3 pop/scripts/pop_status.py`; `python3
pop/scripts/pop_validate.py --standalone`; `git worktree list --porcelain`;
the roadmap, specs, memories, contracts, research, and open-question files
linked above.
