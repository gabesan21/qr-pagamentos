# Epoch 10 - Administrative operations

- **Project:** [[PROJECT|QR Pagamentos]]
- **Roadmap:** [[ROADMAP|Roadmap]]
- **Status:** pendente
- **Yolo:** yes
- **Description:** Deliver administrator analytics and read-only global order/link directories plus user lifecycle and system settings management.
- **Pause if:** global reads cannot keep payer data, owner identity, soft-deleted history, and administrator-only authorization within explicit redaction contracts.

## Recon and forks

- [[researches/panel-rebuild-roadmap/panel-rebuild-roadmap|Panel rebuild roadmap recon]] - confirms the current read-only order base and missing analytics, links, pagination, user profiles, soft delete, and settings routes.
- Fork: if historical USD cannot be derived reproducibly, label the stable stored asset correctly and do not fabricate a USD metric.

## Phase 10.1 - Administrative dashboard

- **Status:** pendente
- **Description:** Define trustworthy platform KPIs and render accessible operational summaries and charts.

| Task | Description | Status |
|------|-------------|--------|
| [[10.1.1-build-admin-analytics-projection]] | Define and query registered/active users, orders, abandonment, links, products, volume, conversion, and top-owner metrics. · size: L | 001_initial_task |
| [[10.1.2-build-admin-dashboard-ui]] | Render bilingual KPI cards and accessible responsive charts with period, empty, loading, and error states. · size: L | 001_initial_task |

## Phase 10.2 - Global order and payment-link directories

- **Status:** pendente
- **Description:** Provide read-only administrator tables over all users' orders and payment links.

| Task | Description | Status |
|------|-------------|--------|
| [[10.2.1-build-admin-orders-directory]] | Add the global order query/table with 10/20/50/100 pages, default 50, filters, owner links, and details. · size: L | 001_initial_task |
| [[10.2.2-build-admin-payment-links-directory]] | Add the global payment-link query/table with status, owner, products/value, expiry, and order drill-down. · size: L | 001_initial_task |

## Phase 10.3 - User lifecycle and support

- **Status:** pendente
- **Description:** Replace the flat account list with safe soft deletion, a detailed directory, and editable user profiles.

| Task | Description | Status |
|------|-------------|--------|
| [[10.3.1-implement-user-soft-delete-lifecycle]] | Add auditable soft deletion, final-admin safety, session revocation, public withdrawal, retention, and history rules. · size: L | 001_initial_task |
| [[10.3.2-build-admin-user-directory]] | Build the paginated searchable user table with status, role, store, activity evidence, and edit/delete actions. · size: L | 001_initial_task |
| [[10.3.3-build-admin-user-profile-editor]] | Add the protected user profile editor for approved account/store fields and a safe public-store link. · size: L | 001_initial_task |

## Phase 10.4 - System settings

- **Status:** pendente
- **Description:** Organize exchange currencies, payment methods, default theme, and existing administrator-only settings.

| Task | Description | Status |
|------|-------------|--------|
| [[10.4.1-build-admin-settings-hub]] | Build the settings route and persist the default theme for new users plus the closed currency/payment configuration. · size: L | 001_initial_task |

## Dependency and parallel-wave map

- 10.3.1 is the lifecycle prerequisite for analytics and all user-facing administrator directories.
- After 10.3.1, 10.1.1, 10.2.1, 10.2.2, and 10.4.1 are logically parallel across separate domains.
- 10.1.2, 10.3.2, and the two directory integrations may proceed in a later UI wave; shared admin shell, tokens, and dictionaries serialize final integration.
- 10.3.3 follows the directory and merchant settings/profile contracts.
