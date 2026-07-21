# Epoch 1 - Administrative foundation

- **Project:** [[PROJECT|QR Pagamentos]] - read for product and harness decisions.
- **Roadmap:** [[ROADMAP|Roadmap]] - read for epoch boundaries.
- **Status:** concluída
- **Yolo:** yes
- **Description:** Establish the self-hosted runtime, identity, access control, global settings, and bilingual admin shell.
- **Pause if:** first-party authentication cannot satisfy revocation, authorization, and session-security acceptance tests without revisiting the no-library constraint.

## Recon and forks

- [[researches/administrative-foundation/administrative-foundation|Administrative foundation research]] - establishes current Next.js, Docker, PostgreSQL, security, and i18n constraints.
- [[researches/epoch-1-quality-hardening/epoch-1-quality-hardening|Epoch 1 quality-hardening recon]] - maps the login failure boundary, current UI architecture, shadcn gap, and concrete visual/code-quality risks that Phase 1.4 must resolve.
- [x] Session policy decided for Phase 1.2: 30-minute idle timeout, 12-hour absolute lifetime, and at most five concurrent sessions per user; encode these limits in executable tests.
- [x] Initial global allowlists decided for Phase 1.3: BRL currency and PIX payment method.
- [x] Exact `/login/submit` production exception identified in task 1.4.1: Prisma attempted to deserialize the PostgreSQL `void` result from `pg_advisory_xact_lock`; the repaired route passed the self-hosted PostgreSQL/Compose regression with sanitized evidence.
- Fork: if PostgreSQL 18 or Node.js 24 is not supported by the deployment host, pin the newest supported LTS pair consistently across local, CI, and production.

## Phase 1.1 - Reproducible platform baseline

- **Status:** concluída
- **Description:** A clean clone builds, tests, migrates, and starts Next.js with PostgreSQL through production-oriented Docker commands.
- **Yolo:** yes
- **Specs:** [[specs/administrative-foundation|Administrative foundation]] - follow for runtime acceptance boundaries.

| Task | Description | Status |
|------|-------------|--------|

## Phase 1.2 - Local identity and access

- **Status:** concluída
- **Description:** Local credentials, database sessions, deployment-seeded admin, and deny-by-default admin/user authorization are testable end to end.
- **Yolo:** yes
- **Specs:** [[specs/administrative-foundation|Administrative foundation]] - follow for identity and access requirements.

| Task | Description | Status |
|------|-------------|--------|

## Phase 1.3 - Administrative control plane

- **Status:** concluída
- **Description:** Establish the reusable admin design system, then let admins manage users and global currencies/payment methods through a responsive, accessible `pt-BR`/`en` interface.
- **Yolo:** yes
- **Specs:** [[specs/administrative-foundation|Administrative foundation]] - follow for admin behavior and UI constraints.
- **Frontend execution gate:** Every Phase 1.3 frontend task must declare `clean-code-change` and `ui-change` in its 004 card row, and `clean-code-review` and `ui-review` in its 005 row. The design-system task also uses `frontend-design`, `design-tokens`, `color-expert`, and `web-design-guidelines`; later tasks use the applicable supporting UI/UX skills selected by those two primary skills.

| Task | Description | Status |
|------|-------------|--------|

## Phase 1.4 - Design-system and quality hardening

- **Status:** concluída
- **Description:** Repair the login failure and turn the existing administrative UI into a professional, modular, reusable shadcn-based system with independently verified code and UX quality.
- **Yolo:** yes
- **Specs:** [[specs/administrative-foundation|Administrative foundation]] - follow for authentication, bilingual UI, accessibility, component-state, and design-system boundaries.
- **Scope boundary:** Improve only the Epoch 1 login and administrative surfaces; do not anticipate storefront, catalog, checkout, or later presentation requirements.
- **Quality gate:** Planning and implementation must use `clean-code-change` and `ui-change` where applicable; verification must use `clean-code-review` and `ui-review`, with the task-specific UI/UX skills recorded in each card. Browser-backed responsive and accessibility evidence is required; another no-capture fallback does not complete this phase.

| Task | Description | Status |
|------|-------------|--------|
