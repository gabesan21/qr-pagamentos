---
author: agent
created: 2026-09-23
---

# 2026-09-23 — Epoch 13 (Pre-production hardening) planning decisions

Recorded when the user commanded "materialize and plan Epoch 13 completely … bring all executable cards to 003_human_approval", with human gates delegated to the coordinator. Inputs: [[researches/pre-production-hardening/2026-09-23-hardening-inventory|hardening inventory]], [[open_questions/2026-07-25-pre-production-gate-restore-webhook-hmac|HMAC reversal gate]], [[notes/decisions/2026-07-25-beta-unverified-webhook-intake|M-5.1 decision]], [[notes/decisions/2026-09-22-v1-removal-and-checkout-decisions|2026-09-22 decisions]].

## Decisions

1. **HMAC reversal proceeds against the documented 2026-07-17 dispatcher contract** already implemented in `webhook-signature.ts`; it does not wait for the on-hold research. The reversal adds a redacted rejection log (delivery UUID, event, reason; never body or signature) so a production signature mismatch is diagnosable, and the first production deliveries are a human checklist item. The research prompt stays in `RESEARCHES.md` for the human; if it ever returns FAIL, that is a new modification.
2. **Epoch 13 is not yolo**: every task stops at `003_human_approval` for the coordinator; the `005_closing` gate is the human PR into `develop`; the scope closes with the `develop` → `main` PR, only suggested by the agent.
3. **Accepted production caveats, recorded, not tasks:** no CSP and no middleware (durable decision of task 5.3.1); the public rate limiter is process-local, so the deployment is single-instance; console-sink JSON logs with no external alerting.
4. **Production origin guard is opt-in for loopback:** a production build refuses a loopback `PUBLIC_ORIGIN` or webhook callback unless the operator sets an explicit allowance the installer writes when the chosen origin is loopback, so the user's local test install keeps working unchanged.
5. **Currency-pair validation is blocked on research**: task 13.4.1 is materialized in `001_initial_task` with `blocked: true` until `nautt-exchange-currencies-contract` is run by the human and ingested; no implementation is planned before that.
6. **F6 (`admin:source-check` red gate) enters Epoch 13** as a release-gate closure, split by subtree write sets; other Epoch 15 follow-ups stay out (resolved, UI nits, or a small modification for F03).
7. **Housekeeping done directly, not as tasks (rule 13):** the missing `## Open` sections of two specs, the misplaced root `memory/` folder, the stale `PublicCheckoutForm` comment. Not performed in this planning session; listed for the weekly-review.

## Out of scope

`NAUTT_API_BASE_URL`; local webhook testing; changing the webhook URL registration surface; provider-side webhook list/delete (undocumented); Nautt idempotency after timeout; external alerting or a distributed limiter.
