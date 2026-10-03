---
task: F-20261003-public-readme
project: qr-pagamentos
started: 2026-10-03
finished: 2026-10-03
commit: 3eb56b252bbcb01950f2552454c2a9769c36d5fe
pr:
authorization: F-20261003-public-readme — triagem de fix direto (regra 13)
---

# F-20261003-public-readme — Public product README

- **Delivery:** Public product README with storefront, payments and operator guidance; the former technical content remains available separately.
- **Verification:** Links, diff, typecheck, lint and build passed. `pnpm check` stopped after 2464 passing tests because three pre-existing async `input-otp` callbacks accessed `window` after Vitest closed.
- **Contract impact:** specs: catalog, checkout, storefront and Nautt contracts reviewed; unchanged · DOX: reviewed; unchanged.

## Entries

- [[F-20261003-public-readme.01-public-product-guide]] — Audience-first product and operations guide.
- [[F-20261003-public-readme.02-technical-reference]] — Original technical README preserved with repaired relative links.

## Links

- **Origin:** direct user-requested hotfix.
- **Commit:** `3eb56b252bbcb01950f2552454c2a9769c36d5fe` — *inspect the documentation diff*.
