# Epoch 8 - Commerce V2 and merchant operations

- **Project:** [[PROJECT|QR Pagamentos]]
- **Roadmap:** [[ROADMAP|Roadmap]]
- **Status:** pendente
- **Yolo:** yes
- **Description:** Add compatible multi-item/fixed-value links, generalized orders, and complete merchant link/order management.
- **Pause if:** an additive design cannot preserve V1 public identifiers, order history, exact-decimal values, and provider reconciliation fences.

## Recon and forks

- [[researches/panel-rebuild-roadmap/panel-rebuild-roadmap|Panel rebuild roadmap recon]] - establishes why carts, fixed values, standalone orders, comments, and local outcomes require compatible V2 records.
- Fork: if safe editing after checkout creation cannot preserve payable snapshots, financial edits create a new immutable link version rather than mutating history.

## Phase 8.1 - Additive link and order contracts

- **Status:** pendente
- **Description:** Specify and implement compatible V2 records without destructive edits to the immutable migration baseline.

| Task | Description | Status |
|------|-------------|--------|

## Phase 8.2 - Merchant payment-link management

- **Status:** pendente
- **Description:** Give merchants complete paginated link creation, editing, lifecycle control, sharing, and order inspection.

| Task | Description | Status |
|------|-------------|--------|

## Phase 8.3 - Merchant order operations

- **Status:** pendente
- **Description:** Deliver the requested owner order directory, filters, local preferences, comments, and local-only lifecycle actions.

| Task | Description | Status |
|------|-------------|--------|
| [[8.3.3-build-owner-orders-management-ui]] | Build the bilingual responsive order table/detail UI with page-size localStorage preference and guarded actions. · size: L | 001_initial_task |

## Phase 8.4 - Merchant dashboard

- **Status:** pendente
- **Description:** Give each merchant trustworthy sales, product, link, and order insight with direct store access.

| Task | Description | Status |
|------|-------------|--------|
| [[8.4.2-build-merchant-dashboard-ui]] | Build the bilingual merchant KPI/chart dashboard with recent activity and a conditional View Store action. · size: L | 001_initial_task |

## Dependency and parallel-wave map

- 8.1.2 and 8.1.3 are logically parallel after 8.1.1 but their Prisma/migration write sets must serialize.
- 8.2.1 and 8.3.1 may run in parallel once their respective V2 services exist.
- 8.2.2, 8.2.3, 8.3.2, and 8.4.1 may run as separate service/query fronts; 8.3.3 and 8.4.2 follow their server contracts.
