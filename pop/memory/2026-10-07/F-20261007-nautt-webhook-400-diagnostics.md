---
task: F-20261007-nautt-webhook-400-diagnostics
project: qr-pagamentos
started: 2026-10-07
finished: 2026-10-07
commit: 0e7df147
authorization: direct-fix triage; approved webhook 400 diagnostics plan
---
# Webhook 400 diagnostics

Structured redacted rejection reasons; original authentication and responses preserved at this commit. Nautt spec synchronized; DOX assessed.

Verification: runtime smoke; intake/route 42/42, logger 5/5; Node 26.4.0, pnpm 11.3.0; typecheck passed; lint passed with 58 warnings outside changed files. No production/Docker calls.

## Entries
- [[F-20261007-nautt-webhook-400-diagnostics.01-structured-reasons]] — Follow for rejection classification.
- [[F-20261007-nautt-webhook-400-diagnostics.02-verification]] — Follow for original verification.

## Links
- [[pop/specs/nautt-finance-integration|Nautt integration]] — Follow for current contracts.
- [[F-20261007-nautt-uuid-owner-routing]] — Follow for the subsequent authorized UUID-routing and HMAC-bypass change.
