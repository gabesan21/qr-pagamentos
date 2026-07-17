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
| [[1.1.1-scaffold-next-platform]] | Create the typed Next.js/pnpm baseline, quality commands, health endpoint, and root DOX contract. | concluída |
| [[1.1.2-establish-prisma-database]] | Add Prisma, PostgreSQL constraints, versioned migrations, and isolated migration/runtime roles. | concluída |
| [[1.1.3-containerize-self-hosted-runtime]] | Deliver non-root production images and Compose startup ordered by database health and migrations. | concluída |

## Phase 1.2 - Local identity and access

- **Status:** concluída
- **Description:** Local credentials, database sessions, deployment-seeded admin, and deny-by-default admin/user authorization are testable end to end.
- **Yolo:** yes
- **Specs:** [[specs/administrative-foundation|Administrative foundation]] - follow for identity and access requirements.

| Task | Description | Status |
|------|-------------|--------|
| [[1.2.1-review-clean-code-baseline]] | Review the Phase 1.1 codebase against the clean-code contracts and remediate confirmed issues before identity and access work begins. · size: M | concluída |
| [[1.2.2-establish-local-identities]] | Add required unique usernames, optional email profile data, password credentials, closed roles, deployment-seeded administration, and secure operator recovery. · size: M | concluída |
| [[1.2.3-implement-database-sessions]] | Deliver bilingual username-and-password sign-in and logout with opaque PostgreSQL sessions, secure cookies, expiry limits, and concurrency enforcement; never fall back to email lookup. · size: M | concluída |
| [[1.2.4-enforce-access-control]] | Enforce deny-by-default server authorization, username-bearing safe user projections with nullable email, session revocation, and final-active-admin protection end to end. · size: M | concluída |

## Phase 1.3 - Administrative control plane

- **Status:** concluída
- **Description:** Establish the reusable admin design system, then let admins manage users and global currencies/payment methods through a responsive, accessible `pt-BR`/`en` interface.
- **Yolo:** yes
- **Specs:** [[specs/administrative-foundation|Administrative foundation]] - follow for admin behavior and UI constraints.
- **Frontend execution gate:** Every Phase 1.3 frontend task must declare `clean-code-change` and `ui-change` in its 004 card row, and `clean-code-review` and `ui-review` in its 005 row. The design-system task also uses `frontend-design`, `design-tokens`, `color-expert`, and `web-design-guidelines`; later tasks use the applicable supporting UI/UX skills selected by those two primary skills.

| Task | Description | Status |
|------|-------------|--------|
| [[1.3.1-establish-admin-design-system]] | Define the admin tone, semantic tokens, `DESIGN.md`, lintable no-raw-value contract, shared primitive inventory, and required component states before building admin screens. · size: M | concluída |
| [[1.3.2-user-language-preference]] | Persist each user's language preference and resolve localized UI without locale-prefixed URLs. · size: M | concluída |
| [[1.3.3-manage-administrative-users]] | Deliver the authenticated, accessible admin shell and user management for accounts, roles, and account status, including protection of the final active administrator. · size: L | concluída |
| [[1.3.4-manage-global-payment-settings]] | Deliver accessible administrator management of the approved global currency and payment-method allowlists. · size: M | concluída |

## Phase 1.4 - Design-system and quality hardening

- **Status:** concluída
- **Description:** Repair the login failure and turn the existing administrative UI into a professional, modular, reusable shadcn-based system with independently verified code and UX quality.
- **Yolo:** yes
- **Specs:** [[specs/administrative-foundation|Administrative foundation]] - follow for authentication, bilingual UI, accessibility, component-state, and design-system boundaries.
- **Scope boundary:** Improve only the Epoch 1 login and administrative surfaces; do not anticipate storefront, catalog, checkout, or later presentation requirements.
- **Quality gate:** Planning and implementation must use `clean-code-change` and `ui-change` where applicable; verification must use `clean-code-review` and `ui-review`, with the task-specific UI/UX skills recorded in each card. Browser-backed responsive and accessibility evidence is required; another no-capture fallback does not complete this phase.

| Task | Description | Status |
|------|-------------|--------|
| [[1.4.1-repair-login-submit-reliability]] | Reproduce and repair the `/login/submit` 500 through the real database/runtime path while preserving opaque credential failures, secure sessions, and bilingual preference resolution. · size: M | concluída |
| [[1.4.2-rebuild-design-system-with-shadcn]] | Audit and rebuild the shared visual foundation with shadcn, professional offline-safe typography, semantic tokens, intentional component APIs/states, and an authoritative specimen. · size: L | concluída |
| [[1.4.3-redesign-login-experience]] | Recompose the bilingual login experience with the shared shadcn system, intentional hierarchy, complete interaction states, and responsive browser evidence. · size: M | concluída |
| [[1.4.4-refactor-admin-surfaces-onto-design-system]] | Modularize and migrate the existing administration surfaces onto the approved shared components without changing authorization or locale behavior. · size: L | concluída |
| [[1.4.5-audit-and-harden-epoch1-code-and-ui]] | Independently audit and remediate Epoch 1 clean-code, React, component-drift, accessibility, responsive, visual, and regression findings before phase closeout. · size: M | concluída |
