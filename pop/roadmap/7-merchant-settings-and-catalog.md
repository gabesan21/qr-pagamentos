# Epoch 7 - Merchant settings and catalog

- **Project:** [[PROJECT|QR Pagamentos]]
- **Roadmap:** [[ROADMAP|Roadmap]]
- **Status:** concluída
- **Yolo:** yes
- **Description:** Give merchants a complete store/profile configuration and an owner-scoped category, product, currency, and image catalog.
- **Pause if:** supported Nautt currency semantics or secure persistent media cannot be proven without weakening the current provider and deployment contracts.

## Recon and forks

- [[researches/panel-rebuild-roadmap/panel-rebuild-roadmap|Panel rebuild roadmap recon]] - identifies the current store/product strengths and missing currency, category, image, theme, logo, layout, and profile contracts.
- Fork: if a configured currency is disabled while referenced, preserve historical reads and block only new selections rather than rewriting past products or orders.

## Phase 7.1 - Exchange currencies and merchant settings

- **Status:** concluída
- **Description:** Establish the dynamic administrator-registered exchange-currency registry and persist the complete merchant store configuration.

| Task | Description | Status |
|------|-------------|--------|

## Phase 7.2 - Categories, products, and images

- **Status:** concluída
- **Description:** Evolve the current owner product CRUD into a categorized, image-backed, currency-consistent catalog.

| Task | Description | Status |
|------|-------------|--------|

## Phase 7.3 - Merchant profile

- **Status:** concluída
- **Description:** Separate profile data and password management from store configuration while keeping username as the only login identity.

| Task | Description | Status |
|------|-------------|--------|

## Dependency and parallel-wave map

- 7.1.1 and 7.2.1 may run in parallel after the Epoch 6 role boundary.
- Prisma/migration work for 7.1.1, 7.1.2, 7.2.1, and 7.2.2 is one serialized write lane despite logical independence.
- After persistence lands, 7.1.3, 7.2.3, and 7.3.1 may run as separate route-domain fronts; shared token/dictionary integration remains serialized.
