# Epoch 7 - Merchant settings and catalog

- **Project:** [[PROJECT|QR Pagamentos]]
- **Roadmap:** [[ROADMAP|Roadmap]]
- **Status:** pendente
- **Yolo:** yes
- **Description:** Give merchants a complete store/profile configuration and an owner-scoped category, product, currency, and image catalog.
- **Pause if:** supported Nautt currency semantics or secure persistent media cannot be proven without weakening the current provider and deployment contracts.

## Recon and forks

- [[researches/panel-rebuild-roadmap/panel-rebuild-roadmap|Panel rebuild roadmap recon]] - identifies the current store/product strengths and missing currency, category, image, theme, logo, layout, and profile contracts.
- Fork: if a configured currency is disabled while referenced, preserve historical reads and block only new selections rather than rewriting past products or orders.

## Phase 7.1 - Exchange currencies and merchant settings

- **Status:** pendente
- **Description:** Establish the closed currency catalog and persist the complete merchant store configuration.

| Task | Description | Status |
|------|-------------|--------|
| [[7.1.1-model-supported-exchange-currencies]] | Model active BRL, ARS, BOB, and COP exchange currencies, Nautt UUID mappings, and safe selection defaults. · size: L | 001_initial_task |
| [[7.1.2-extend-merchant-store-settings]] | Persist theme, logo, layout, store/ad-hoc toggles, slug, display name, and one active default currency. · size: L | 001_initial_task |
| [[7.1.3-build-store-settings-and-logo-management]] | Deliver the bilingual store settings UI with previews, constraints, logo upload, and official fallback. · size: L | 001_initial_task |

## Phase 7.2 - Categories, products, and images

- **Status:** pendente
- **Description:** Evolve the current owner product CRUD into a categorized, image-backed, currency-consistent catalog.

| Task | Description | Status |
|------|-------------|--------|
| [[7.2.1-add-owner-product-categories]] | Add owner-scoped category persistence and opaque create, edit, deactivate, and reassignment behavior. · size: M | 001_initial_task |
| [[7.2.2-evolve-products-for-catalog-media]] | Add category, currency, image, archival, and immutable historical-reference contracts to products. · size: L | 001_initial_task |
| [[7.2.3-build-product-category-management]] | Build dedicated product/category list, create, and edit pages with uploads, placeholders, and size guidance. · size: L | 001_initial_task |

## Phase 7.3 - Merchant profile

- **Status:** pendente
- **Description:** Separate profile data and password management from store configuration while keeping username as the only login identity.

| Task | Description | Status |
|------|-------------|--------|
| [[7.3.1-build-merchant-profile-management]] | Add owner username, optional email, and password management with conflicts, current-password proof, and session rules. · size: L | 001_initial_task |

## Dependency and parallel-wave map

- 7.1.1 and 7.2.1 may run in parallel after the Epoch 6 role boundary.
- Prisma/migration work for 7.1.1, 7.1.2, 7.2.1, and 7.2.2 is one serialized write lane despite logical independence.
- After persistence lands, 7.1.3, 7.2.3, and 7.3.1 may run as separate route-domain fronts; shared token/dictionary integration remains serialized.
