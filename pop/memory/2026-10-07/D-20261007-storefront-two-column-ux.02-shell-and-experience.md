---
task: D-20261007-storefront-two-column-ux
entry: 02-shell-and-experience
---
# Shell variant and storefront experience

`CheckoutShell` gains `variant="storefront"` (`max-w-app`, horizontal bordered header); `/pay/*` and the standalone-only/empty/unavailable branches keep `max-w-checkout`. The experience renders free-amount form, catalog and cart in a grid (catalog left from `lg`), with a non-persisted cards/list toggle defaulting from the owner layout. "Pagar agora" hard-navigates to `/store/[slug]/pay?amount=…` (prefill only; invalid input shows the localized error).

## Evidence
- [[DESIGN]] — *storefront shell variant paragraph*.
