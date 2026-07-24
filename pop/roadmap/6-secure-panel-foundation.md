# Epoch 6 - Secure panel foundation

- **Project:** [[PROJECT|QR Pagamentos]] - read for identity, runtime, i18n, and product boundaries.
- **Roadmap:** [[ROADMAP|Roadmap]] - read for the complete rebuild sequence.
- **Status:** pendente
- **Yolo:** yes
- **Description:** Separate administrator and merchant capabilities and establish the shared brand, theme, navigation, table, i18n, and media foundations.
- **Pause if:** the role-capability matrix or additive migration constraints cannot preserve current owner isolation and existing public identifiers.

## Recon and forks

- [[researches/panel-rebuild-roadmap/panel-rebuild-roadmap|Panel rebuild roadmap recon]] - establishes the role defect, reusable V1 safety contracts, additive-only evolution, and shared write lanes.
- Fork: if six accessible theme personalities cannot share one semantic component contract, reduce visual variation rather than introduce component-local tokens.

## Phase 6.1 - Panel architecture and authorization

- **Status:** pendente
- **Description:** Fix the target information architecture and enforce mutually exclusive administrator and merchant capabilities.

| Task | Description | Status |
|------|-------------|--------|
| [[6.1.1-define-panel-architecture-and-permissions]] | Specify the persona capability matrix, route map, durable contracts, and compatibility decisions for the rebuild. · size: M | 001_initial_task |
| [[6.1.2-enforce-role-exclusive-authentication]] | Route each role to its panel and deny administrators every merchant read/mutation while preserving opaque outcomes. · size: L | 001_initial_task |
| [[6.1.3-modularize-domain-dictionaries]] | Split the bilingual dictionaries by product domain while preserving the closed locale and parity contracts. · size: M | 001_initial_task |

## Phase 6.2 - Brand, themes, and application shells

- **Status:** pendente
- **Description:** Establish a distinctive six-theme visual system, official brand assets, and responsive role-specific navigation shells.

| Task | Description | Status |
|------|-------------|--------|
| [[6.2.1-create-six-theme-design-system]] | Define six named accessible themes and evolve the token, motion, typography, and evidence contracts. · size: L | 001_initial_task |
| [[6.2.2-create-official-brand-assets]] | Generate and integrate the official logo family for favicon, login, sidebar, and fallback merchant branding. · size: M | 001_initial_task |
| [[6.2.3-build-role-specific-app-shells]] | Build bilingual admin/merchant shells and sidebars with the required route areas and responsive states. · size: L | 001_initial_task |

## Phase 6.3 - Shared table and media foundations

- **Status:** pendente
- **Description:** Provide reusable scoped data-directory primitives and a secure host-persistent media boundary.

| Task | Description | Status |
|------|-------------|--------|
| [[6.3.1-build-pagination-filter-table-foundation]] | Add stable server pagination/filter contracts and accessible reusable data-table states for both panels. · size: L | 001_initial_task |
| [[6.3.2-build-secure-media-storage-service]] | Implement owner/purpose-scoped image validation, metadata, atomic storage, safe serving, and lifecycle rules. · size: L | 001_initial_task |
| [[6.3.3-provision-persistent-media-operations]] | Add the non-root persistent media volume and installer, update, backup, restore, and uninstall contracts. · size: L | 001_initial_task |

## Dependency and parallel-wave map

- Wave 1: 6.1.1 and 6.1.3 may run in parallel.
- Wave 2: 6.1.2, 6.2.1, and 6.3.2 may run in parallel after their listed prerequisites.
- Wave 3: 6.2.2, 6.3.1, and 6.3.3 may run in parallel; 6.2.3 integrates the shared shell last.
- Serialize the visual-token lane, the Prisma lane, and the Compose/install lane even where logical dependencies permit concurrency.
