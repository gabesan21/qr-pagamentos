# Epoch 1 - Administrative foundation

- **Project:** [[PROJECT|QR Pagamentos]] - read for product and harness decisions.
- **Roadmap:** [[ROADMAP|Roadmap]] - read for epoch boundaries.
- **Status:** em andamento
- **Description:** Establish the self-hosted runtime, identity, access control, global settings, and bilingual admin shell.
- **Pause if:** first-party authentication cannot satisfy revocation, authorization, and session-security acceptance tests without revisiting the no-library constraint.

## Recon and forks

- [[researches/administrative-foundation/administrative-foundation|Administrative foundation research]] - establishes current Next.js, Docker, PostgreSQL, security, and i18n constraints.
- [x] Session policy decided for Phase 1.2: 30-minute idle timeout, 12-hour absolute lifetime, and at most five concurrent sessions per user; encode these limits in executable tests.
- [ ] RECON NEEDED: exact global currency and payment-method settings - check: define the initial allowlists before planning Phase 1.3.
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

- **Status:** pendente
- **Description:** Local credentials, database sessions, deployment-seeded admin, and deny-by-default admin/user authorization are testable end to end.
- **Yolo:** yes
- **Specs:** [[specs/administrative-foundation|Administrative foundation]] - follow for identity and access requirements.

| Task | Description | Status |
|------|-------------|--------|
| [[1.2.1-review-clean-code-baseline]] | Review the Phase 1.1 codebase against the clean-code contracts and remediate confirmed issues before identity and access work begins. · size: M | concluída |
| [[1.2.2-establish-local-identities]] | Add local email identities, password credentials, closed roles, deployment-seeded administration, and secure operator recovery. · size: M | 001_initial_task |
| `1.2.3-implement-database-sessions` | Deliver bilingual credential sign-in and logout with opaque PostgreSQL sessions, secure cookies, expiry limits, and concurrency enforcement. · size: M | not started |
| `1.2.4-enforce-access-control` | Enforce deny-by-default server authorization, safe user projections, session revocation, and final-active-admin protection end to end. · size: M | not started |

## Phase 1.3 - Administrative control plane

- **Status:** pendente
- **Description:** Admins manage users and global currencies/payment methods through a responsive, accessible `pt-BR`/`en` interface.
- **Yolo:** yes
- **Specs:** [[specs/administrative-foundation|Administrative foundation]] - follow for admin behavior and UI constraints.

| Task | Description | Status |
|------|-------------|--------|
| `1.3.1-user-language-preference` | Persist each user's language preference and resolve localized UI without locale-prefixed URLs. · size: M | not started |
