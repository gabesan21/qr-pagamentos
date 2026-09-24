# Epoch 13 - Pre-production hardening

- **Project:** [[PROJECT|QR Pagamentos]]
- **Roadmap:** [[ROADMAP|Roadmap]]
- **Status:** concluída (2026-09-24)
- **Description:** Restore the webhook trust gate, close the release-blocking lifecycle gaps, make deployment documentation and release gates truthful, and validate provider configuration before the first production deployment.
- **Yolo:** não — every task stops at `003_human_approval` for the coordinator (user command 2026-09-23); the `005_closing` gate is the human PR.
- **Pause if:** the HMAC reversal would require a contract Nautt never documented, or a task would need `NAUTT_API_BASE_URL`, local webhook delivery, or a change to the webhook URL registration surface.

## Recon and forks

- [[researches/pre-production-hardening/2026-09-23-hardening-inventory|Hardening inventory]] - confirmed footprint of the BETA seam, runbook drift, secret posture, provider-config gap and the Epoch 15 follow-ups, with file:line evidence.
- [[notes/decisions/2026-09-23-epoch-13-decisions|2026-09-23 decisions]] - reversal against the documented contract, accepted caveats, opt-in loopback guard, research-blocked pair validation.
- [[open_questions/2026-07-25-pre-production-gate-restore-webhook-hmac|HMAC reversal gate]] and [[notes/decisions/2026-07-25-beta-unverified-webhook-intake|M-5.1 decision]] - the verbatim reversal instructions.
- [ ] RECON NEEDED: production dispatcher HMAC fixture - check: human runs `nautt-production-webhook-hmac-contract` ([[RESEARCHES|RESEARCHES]]); FAIL → new modification, never a silent re-suspension.
- [ ] RECON NEEDED: `/exchange-currencies` semantics for PIX/BRL pairs - check: human runs `nautt-exchange-currencies-contract` ([[RESEARCHES|RESEARCHES]]) — standing gap; 13.4.1 is planned from the in-repo documentation and declares what it cannot prove.
- Fork: if production deliveries fail HMAC after 13.1, the rejection log (13.1.1) decides between a fixture defect and a contract gap; the answer is a modification, not a re-suspension.
- Fork: if `admin:source-check` findings exceed one task, 13.3.2 splits by subtree write set into sibling tasks rather than inflating its budget.

## Phase 13.1 - Webhook trust restoration

- **Status:** concluída (2026-09-23)
- **Description:** Reverse M-5.1: signature verification, owner binding and `401` return; every beta caveat leaves the contracts.
- **Specs:** [[specs/nautt-finance-integration|Nautt Finance integration]]

## Phase 13.2 - Lifecycle release blockers

- **Status:** concluída (2026-09-24)
- **Description:** Define the undefined money-state transition, guard production origins, and give the encryption keys a rotation path.
- **Specs:** [[specs/checkout-and-order-lifecycle|Checkout and order lifecycle]], [[specs/nautt-finance-integration|Nautt Finance integration]], [[specs/identity-security|Identity security]]

## Phase 13.3 - Deployment truth and release gates

- **Status:** concluída (2026-09-24)
- **Description:** Runbook, README and release evidence describe the 16-migration V2-only deployment; the `admin:source-check` gate's shell-class/token findings turn green (raw-control debt elsewhere is a tracked follow-up, out of phase); a dated rehearsal protocol replaces the 2026-07-31 waiver.
- **Specs:** [[specs/administrative-foundation|Administrative foundation]], [[specs/application-frontend-system|Application frontend system]]

## Phase 13.4 - Provider configuration trust

- **Status:** concluída (2026-09-24) — planned from in-repo Nautt documentation (user command 2026-09-23); the `/exchange-currencies` research stays a standing gap
- **Description:** A registered currency pair is proven to yield a PIX/BRL onramp before it can be selected, and `GlobalPaymentSettings` is read by the checkout.

## Dependency and parallel-wave map

- Serialized by `depends_on` after the 002 plans exposed shared files (spec Nautt, DOX nautt, installer, runbook, `PROJECT.md`): 13.1.1 → 13.1.2 → 13.2.2 → 13.2.3 → 13.3.1 → 13.3.3. 13.2.1 (checkout/orders) and 13.3.2 (shell + checker) are write-set independent and may run in parallel with that chain, at most three tasks at a time; each phase verification runs last in its phase.
- 13.4 is planned from the in-repo Nautt documentation (user command 2026-09-23); 13.4.1 has no kanban prerequisite. 13.4.2 closed after 13.3.4 and is the epoch's hand-off (2026-09-24).
