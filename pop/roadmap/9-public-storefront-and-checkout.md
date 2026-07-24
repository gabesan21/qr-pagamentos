# Epoch 9 - Public storefront and checkout

- **Project:** [[PROJECT|QR Pagamentos]]
- **Roadmap:** [[ROADMAP|Roadmap]]
- **Status:** pendente
- **Yolo:** yes
- **Description:** Deliver the branded storefront cart, standalone payment, and composable public QR checkout journeys.
- **Pause if:** any sessionless flow must trust browser-supplied owner, price, currency, total, status, or provider data.

## Recon and forks

- [[researches/panel-rebuild-roadmap/panel-rebuild-roadmap|Panel rebuild roadmap recon]] - maps the current redacted storefront/checkout boundaries and the missing cart, ad-hoc, branding, and terminal states.
- Fork: if store-disabled and ad-hoc-only behavior remain contradictory, task 7.1.2 must resolve the route/enablement contract before this epoch starts.

## Phase 9.1 - Storefront catalog and cart

- **Status:** pendente
- **Description:** Publish a redacted branded catalog in boxed/table layouts with an isolated browser cart.

| Task | Description | Status |
|------|-------------|--------|
| [[9.1.1-extend-public-storefront-projection]] | Expose only safe theme, logo, layout, category, product, price, availability, and ad-hoc capability data. · size: L | 001_initial_task |
| [[9.1.2-build-storefront-catalog-and-cart]] | Build boxed/table storefront views with ad-hoc first item, quantities, slug-scoped localStorage cart, and exact totals. · size: L | 001_initial_task |
| [[9.1.3-issue-storefront-one-time-links]] | Add a rate-limited sessionless cart command that revalidates everything and issues one owner-derived one-time link. · size: L | 001_initial_task |

## Phase 9.2 - Standalone payment

- **Status:** pendente
- **Description:** Let a buyer enter an amount and open a direct order in the store default currency without creating a payment link.

| Task | Description | Status |
|------|-------------|--------|
| [[9.2.1-implement-standalone-payment-orders]] | Add sessionless ad-hoc reservation, provider dispatch, retry fencing, and capability polling without a link record. · size: L | 001_initial_task |
| [[9.2.2-build-standalone-payment-experience]] | Build the bilingual amount, QR, copy, status, failure, and return experience for standalone payments. · size: L | 001_initial_task |

## Phase 9.3 - Branded composable checkout

- **Status:** pendente
- **Description:** Generalize public checkout for product lines or fixed descriptions and apply the merchant's selected brand.

| Task | Description | Status |
|------|-------------|--------|
| [[9.3.1-build-branded-composable-checkout]] | Deliver the two-column customer/item summary and QR/status flow with server-derived totals, merchant theme, and logo. · size: L | 001_initial_task |
| [[9.3.2-complete-public-link-terminal-states]] | Render an explicit paid view for consumed one-time links and opaque 404 outcomes for inactive or unavailable links. · size: M | 001_initial_task |

## Dependency and parallel-wave map

- 9.1.1 can begin with public redaction while 8.1 services stabilize; its final contract depends on those services.
- 9.1.3 and 9.2.1 may run in parallel as separate public commands after their model prerequisites, with one owner for rate-limit/log inventories.
- 9.2.2 and 9.3.1 may run in parallel only after shared theme/dictionary integration is assigned; 9.3.2 follows checkout lifecycle completion.
