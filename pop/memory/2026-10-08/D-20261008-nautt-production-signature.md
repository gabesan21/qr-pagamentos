---
task: D-20261008-nautt-production-signature
project: qr-pagamentos
started: 2026-10-08
finished: 2026-10-08
commit: 43faa042
pr: null
authorization: Approved no-kanban plan; approved-004-card exception and direct-pnpm verification.
---

# Nautt production signature

- **Delivery:** Owner-bound HMAC restored; UUID resolution and recovery preserved.
- **Verification:** Pinned 10-module gate, final route delta, typecheck, scoped ESLint and 10-case real-POST smoke passed.
- **Contracts:** [[pop/specs/nautt-finance-integration|Spec]] and [[src/integrations/nautt/AGENTS|DOX]] — follow for current authentication; synthesis synchronized.

## Entries

- [[D-20261008-nautt-production-signature.01-intake]] — authentication boundary.
- [[D-20261008-nautt-production-signature.02-secret]] — secret lifecycle.
- [[D-20261008-nautt-production-signature.03-proof]] — verification and limits.
- [[D-20261008-nautt-production-signature.04-authorization]] — approval scope.
- [[D-20261008-nautt-production-signature.05-contracts]] — contract sync.

43faa042 — inspect the implementation diff.
