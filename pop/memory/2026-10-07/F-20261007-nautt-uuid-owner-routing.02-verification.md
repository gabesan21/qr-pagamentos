---
task: F-20261007-nautt-uuid-owner-routing
entry: 02-verification
---
# Exercised verification

Node 26.4.0/pnpm 11.3.0: all 426 tests in 18 complete Nautt/route/logger modules passed; typecheck passed. Executor initially used Node 26.10.0; final pinned run supersedes that result. Non-Vitest smoke exercised real intake/store/logger plus Prisma resolver fixture: missing signature 204, wrong-signature replay 204, unknown UUID 204, identity conflict 400, invalid date 400; four owner lookups, one reconciliation. No production DB/provider or Docker calls.

## Evidence
- [[src/integrations/nautt/webhook-intake.test.ts]] — Follow for routing/replay boundaries.
- [[src/integrations/nautt/webhook-runtime.test.ts]] — Follow for persisted lookup coverage.
