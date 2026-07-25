---
status: aberta
origem: projeto
created: 2026-07-25
---

# Pre-production gate: restore webhook HMAC verification (M-5.1 reversal)

**Production release is BLOCKED until the human explicitly commands the M-5.1 reversal and it lands.**

Since task [[M-5.1-beta-unverified-webhook-intake]] (human beta decision 2026-07-25, recorded in [[notes/decisions/2026-07-25-beta-unverified-webhook-intake]]), the Nautt webhook callback accepts bodies WITHOUT HMAC signature verification: missing, malformed, and wrong `X-Nautt-Signature` values are all accepted, and owner attribution rides the local `provider_order.providerOrderUuid` lookup. The `401` status is suspended; unknown orders are acknowledged `204` without durable evidence.

This is acceptable only for the closed beta. Before any production release the human must explicitly command the reversal, which must:

1. Restore the signature gate + `verifyOwner` block and the `401` status in `src/integrations/nautt/webhook-intake.ts` (reversal target: `webhook-signature.ts`, kept intact and green).
2. Remove the `resolveOwner` dependency from the intake and `webhook-runtime.ts`; delete `webhook-intake-beta.test.ts`; convert the beta-acceptance pins in `webhook-intake.test.ts` back to `401` rejections.
3. Clear every `BETA(M-5.1)` caveat in `pop/specs/nautt-finance-integration.md`, root `AGENTS.md`, and `src/integrations/nautt/AGENTS.md`, restoring the permanent post-beta contract wording.
4. Resume the on-hold `nautt-production-webhook-hmac-contract` research ([[RESEARCHES]]) if the production HMAC contract is still unproven at that point.
