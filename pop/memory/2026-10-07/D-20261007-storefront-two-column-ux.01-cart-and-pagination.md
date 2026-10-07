---
task: D-20261007-storefront-two-column-ux
entry: 01-cart-and-pagination
---
# Cart core and pagination

The browser cart is product-only: the custom-amount item, its setter and its totals arm are removed, and a stored legacy `custom-amount` entry is dropped on hydration with the one "cart updated" notice (storage `v1` unchanged). `paginateStorefrontCatalog` slices the already-bounded snapshot client-side, 12 per page, repeating a group name across a page boundary and clamping out-of-range pages.

## Evidence
- [[pop/specs/storefront-and-customization]] — *M-23.1 slice and amended cart rules*.
