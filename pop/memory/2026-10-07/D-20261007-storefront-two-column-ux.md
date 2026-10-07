---
task: D-20261007-storefront-two-column-ux
project: qr-pagamentos
started: 2026-10-07
finished: 2026-10-07
commit: a8c1db52
route: no-kanban plan-mode (rule 13); branch storefront-two-column-ux, local only
---
# D-20261007-storefront-two-column-ux

- **Delivered:** `/store/[slug]` catalog branch is a wide two-column page with a horizontal header, a 12-per-page catalog with cards/list toggle, and a free-amount form that pays directly instead of entering the cart.
- **Verification:** `pnpm check` exit 0 (273 files, 2479 tests passed, build ok). Browser smoke, `tests/storefront.evidence.spec.ts` and Docker checks not run: user-exclusive.
- **Contracts:** spec storefront-and-customization and DESIGN.md updated; DOX files assessed, unchanged (the server still rejects `custom-amount`).

## Entries
- [[D-20261007-storefront-two-column-ux.01-cart-and-pagination]] — Cart core and pagination.
- [[D-20261007-storefront-two-column-ux.02-shell-and-experience]] — Shell variant and page.
- [[D-20261007-storefront-two-column-ux.03-tests-evidence-docs]] — Tests, evidence, docs.
