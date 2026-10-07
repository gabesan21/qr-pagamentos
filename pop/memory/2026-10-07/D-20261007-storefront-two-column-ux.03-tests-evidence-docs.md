---
task: D-20261007-storefront-two-column-ux
entry: 03-tests-evidence-docs
---
# Tests, evidence and docs

Unit tests cover cart hydration, pagination, shell variant, 13-product paging, toggle state and the pay-now form. The evidence spec and verifier now assert the pay-now flow, product-only totals (12.5, then 25) and `data-view="list"`; they are edited, not executed (Docker). The spec file already uses selectors absent from current source (`main.storefront-shell`, `img.storefront-logo`), which predates this change.

## Evidence
- [[pop/specs/storefront-and-customization]] — *M-23.1 slice*.
