---
task: F-20261007-nautt-uuid-owner-routing
project: qr-pagamentos
started: 2026-10-07
finished: 2026-10-07
commit: b654d2a5
authorization: explicit user command; permanent UUID-based ownership, temporary production signature bypass, commit and push main
---
# UUID-owned webhook intake

Persisted globally unique Nautt order UUID selects the owner, permanently. Signature enforcement commented for the explicitly authorized production test; no secret reads. Unknown UUID is a no-op. Nautt spec and subtree DOX synchronized.

## Entries
- [[F-20261007-nautt-uuid-owner-routing.01-ownership]] — Follow for the ownership cutover.
- [[F-20261007-nautt-uuid-owner-routing.02-verification]] — Follow for exercised checks and runtime smoke.
- [[F-20261007-nautt-uuid-owner-routing.03-auth-exception]] — Follow for the production risk and restoration instructions.

## Links
- [[pop/specs/nautt-finance-integration|Nautt integration]] — Follow for current webhook contracts.
