---
task: D-20261008-nautt-production-signature
entry: 03-proof
---

# Isolated security and recovery proof

Node 26.4.0 / pnpm 11.3.0: approved 10-module gate passed 166 tests; typecheck and changed-file ESLint passed. Removed a forwarding-only route test; final real-intake multi-chunk route module passed 6 tests and ESLint. Stdin real-POST smoke passed 10 cases: unsigned 401/no effects; settlement 503 then signed retry/duplicate 204 with one total GET; tamper/wrong-owner 401; direct/unknown 204; invalid JSON 400; oversize 413. All empty/no-store. Settlement was an isolated model, not V2 transactional proof; genuine production delivery remains unverified.

- [[src/app/api/nautt/webhooks/route.test.ts|Route]] — follow for signed HTTP acceptance/rejection.
