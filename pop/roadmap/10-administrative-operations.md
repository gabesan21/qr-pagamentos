# Epoch 10 - Administrative operations

- **Project:** [[PROJECT|QR Pagamentos]]
- **Roadmap:** [[ROADMAP|Roadmap]]
- **Status:** concluída
- **Yolo:** yes
- **Description:** Deliver administrator analytics and read-only global order/link directories plus user lifecycle and system settings management.
- **Pause if:** global reads cannot keep payer data, owner identity, soft-deleted history, and administrator-only authorization within explicit redaction contracts.
- **Release gate (2026-07-31):** every phase task is integrated in `develop` and PR #9 (`develop` → `main`, "Epochs 10–11") was merged on 2026-07-31.

## Recon and forks

- [[researches/panel-rebuild-roadmap/panel-rebuild-roadmap|Panel rebuild roadmap recon]] - confirms the current read-only order base and missing analytics, links, pagination, user profiles, soft delete, and settings routes.
- Fork: if historical USD cannot be derived reproducibly, label the stable stored asset correctly and do not fabricate a USD metric.

## Phase 10.1 - Administrative dashboard

- **Status:** concluída
- **Description:** Define trustworthy platform KPIs and render accessible operational summaries and charts.

| Task | Description | Status |
|------|-------------|--------|

## Phase 10.2 - Global order and payment-link directories

- **Status:** concluída
- **Description:** Provide read-only administrator tables over all users' orders and payment links.

| Task | Description | Status |
|------|-------------|--------|

## Phase 10.3 - User lifecycle and support

- **Status:** concluída
- **Description:** Replace the flat account list with safe soft deletion, a detailed directory, and editable user profiles.

| Task | Description | Status |
|------|-------------|--------|

## Phase 10.4 - System settings

- **Status:** concluída
- **Description:** Organize exchange currencies, payment methods, default theme, and existing administrator-only settings.

| Task | Description | Status |
|------|-------------|--------|

## Dependency and parallel-wave map

- 10.3.1 is the lifecycle prerequisite for analytics and all user-facing administrator directories.
- After 10.3.1, 10.1.1, 10.2.1, 10.2.2, and 10.4.1 are logically parallel across separate domains.
- 10.1.2, 10.3.2, and the two directory integrations may proceed in a later UI wave; shared admin shell, tokens, and dictionaries serialize final integration.
- 10.3.3 follows the directory and merchant settings/profile contracts.
