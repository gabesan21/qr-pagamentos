---
author: user
created: 2026-09-22
---

# 2026-09-22 — V1 removal, no-retry checkout and PIX integrity decisions

Recorded in substance from the user's (Gabriel's) commands on 2026-09-22 during the read-only UI/UX and PIX review (synthesis: [[researches/pix-checkout-review/2026-09-22-review-findings|review findings]]). They authorize and bound [[roadmap/15-v2-only-pix-integrity-and-explicit-checkout|Epoch 15]]. Sovereign human commands under rule 20 of the project AGENTS; each overrides only the rule it names.

## Decisions

1. **V1 never existed as a product.** The V1 payment-link/checkout/order line was an internal invention; there is no production or legacy to preserve. V1 is removed **integrally** from application code, routes, screens, DTOs, specs, tests, parity references and persistence (tables and base migrations). No compatibility layer, no data migration, no V1 settle wiring. The open question [[open_questions/2026-07-26-v1-settle-wiring-gap|V1 settle-wiring gap]] is superseded, not fixed.
2. **Destructive authorization (explicit).** The project was never in production. The user authorizes destroying the current local Docker environment and altering `prisma/migrations` and the pinned migration baseline during `004_processing` of the task that removes V1 persistence. For that task only, this overrides the M-2 rule "prohibit destructive migrations" and the `prisma/AGENTS.md` baseline-immutability line; both contracts are rewritten by the same task. The physical drop is not deferred: it happens in Epoch 15.
3. **No retry rule in the checkout, automatic or manual.** The buyer checkout keeps no polling backoff retry, no "check again", no "try payment again", no "new payment" action and no fallback that re-executes a failed operation. Every non-confirmed outcome is an **explicit state**; the only action is **"Start over"**, which discards the attempt and begins a new flow with a new idempotency key. Reading the payment status every 5 s stays: it is state observation, not repetition of a failed call. Server-side idempotent replay of the same request stays: it is a safety fence, not a UI rule.
4. **Customer-data block is invisible when the policy is `NONE`.** No heading, no notice, no placeholder saying that no data is required; the pay action and privacy line keep their place. The supplied template already behaves this way (`docs/template/app/src/pages/checkout/CheckoutPage.tsx`, `needsForm`).
5. **PIX integrity.** Reconciliation must never erase a stored PIX payload; documented deterministic provider creation errors must fail closed instead of becoming `INDETERMINATE`; the buyer never sees a waiting placeholder for data that will never arrive.
6. **Approved template/a11y/UI adjustments** are those listed in the review findings for the public checkout plus the drift sweep; the design contract stays the project's own (`DESIGN.md`, `docs/template/app/**`), never a new design system.

## Explicitly out of scope

- `NAUTT_API_BASE_URL` is validated configuration: no task, diagnosis or normalization touches it.
- Webhook delivery is **not** tested locally; reconciliation logic is covered by unit/integration tests without Docker and the webhook is exercised in production.
- The Nautt webhook URL registration/configuration surface stays intact.
- Epoch 13 (HMAC restore, pair validation) stays pending and separate.

## Delivery posture

- Epoch 15 is **not yolo**: every task stops at `003_human_approval` for coordination; the gate of `005_closing` is the human PR.
- Tasks integrate into `develop`; the scope closes with the `develop` → `main` PR.
- Cards were released from 001 by this explicit command ("materialize ... deixe tudo em 003_human_approval"), recorded in each card's Log.
