---
task: F-20261008-prune-unused-scripts-tests
entry: 03-assertions
---

# Prune redundant test assertions

Removed the redundant health-status and payment-link source-text assertions from routes.test.ts, and fixture sanity from globals-bem-retirement.test.ts. Removed the unused health and statSync imports. Preserved remaining assertions and behavioral endpoint coverage. Both targeted Vitest commands passed with three tests each under Node 26.4.0 and pnpm 11.3.0.

## Evidence

- [[src/app/routes.test.ts|Routes]] — follow for retained route constraints.
- [[src/app/globals-bem-retirement.test.ts|CSS retirement]] — follow for retained source traversal and CSS contracts.
