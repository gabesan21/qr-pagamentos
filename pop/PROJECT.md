# QR Pagamentos

- **Category:** [[applications/qr-pagamentos/ROADMAP|Roadmap]]

## Objective

Deliver a production-ready dashboard where users create products and their own PIX or international QR-code payment links, while Nautt Finance converts fiat proceeds to USDT in each user's wallet. Success means every scoped workflow is tested and functional in a self-hosted deployment.

## Context

The application owns the catalog, payment-link lifecycle, public checkout, and order views. Nautt Finance is used only to open and query orders and receive webhooks; its hosted payment-link feature is explicitly forbidden.

## Current state (2026-07-27)

The repository holds a working Next.js application in `src/` plus `prisma/`, `container/`, and `install/`. Epochs 1 to 10 are delivered and integrated in `develop`: self-hosted runtime, identity and access control, the bilingual `pt-BR`/`en` admin and merchant panels, the Nautt provider integration (orders, polling, webhook intake and recovery), the administrator catalog and dynamic supported-exchange-currency registry, merchant products/categories/media, Commerce V2 payment links and generalized orders, the public storefront with cart and standalone payments, the branded public checkout with its terminal states, and the administrator operations surface (analytics dashboard, global order and payment-link directories, user directory and profile editor, soft-delete lifecycle, settings hub). Epoch 10's release gate is open: PR #9 (`develop` → `main`) awaits human testing and merge. Epoch 11 (identity security and release) is the next planned epoch, with its tasks sitting in `pop/kanban/001_initial_task`.

Two beta/deferred conditions are live and tracked outside this brief: the Nautt webhook callback currently accepts unsigned bodies (M-5.1 beta decision, must be reversed before production), and CSP is deferred by decision. See [[AGENTS|project AGENTS]] and `pop/open_questions/`.

## Folder structure

This is an `included` project: application code lives at the repository root (`src/`, `prisma/`, `container/`, `install/`, `scripts/`, `tests/`) and the complete PoP harness lives in `pop/`. Nautt documentation supplied by the user belongs in `pop/researches/nautt-finance/raw/`, already ingested for the provider integration.

## Agent harness

- **Type and repository:** declared in [[AGENTS|project AGENTS]]; task PRs target `develop` inside yolo phases and final phase PRs target `main`.
- **Worktree per task:** yes.
- **Stack:** Next.js full-stack, pnpm, Node.js LTS, Prisma, PostgreSQL, and self-hosted Docker.
- **Authentication:** local credentials and a simple first-party database session implementation; no external authentication service or framework.
- **Bootstrap:** deployment seed creates the first administrator.
- **Style:** commercially vibrant, responsive, accessible, and bilingual (`pt-BR`, `en`).
- **Critical tasks by default:** no; a task becomes critical when it handles secrets, authentication boundaries, authorization, webhook trust, order money/state transitions, or destructive data operations.
- **Yolo:** phases are yolo scopes with objectively testable deliverables; the human validates each completed phase before merging `develop` into `main`.
- **Project skills:** none yet; operational skills are created only after commands exist.

## Related projects

None. This project is an independent island in the vault.

## Decisions

- **2026-07-13:** Use an `included` harness in the application repository so code, roadmap, specs, and workflow remain standalone.
- **2026-07-13:** Keep payment-link ownership in this application and use Nautt only for order creation, order queries, and webhooks.
- **2026-07-13:** Use Prisma and local first-party authentication, with the first admin created by a deployment seed.
- **2026-07-13:** Deliver every phase through yolo task PRs integrated into `develop`, followed by human testing and a final PR to `main`.

### Decision notes

- [[notes/decisions/2026-07-13-project-foundation|Project foundation]] — *read before reopening the product boundary, stack, delivery route, or the Nautt pricing/wallet allowances.*
- [[notes/decisions/2026-07-14-installer-simplification|Installer simplification]] — *read before adding host privilege escalation, OS package management, or `sudo` to `install/`.*
- [[notes/decisions/2026-07-20-multi-agent-workflow|Multi-agent workflow adoption]] — *read before changing planner/executor roles, ownership rules, or the single fresh-context review gate.*
- [[notes/decisions/2026-07-25-beta-unverified-webhook-intake|Beta unverified webhook intake]] — *read before touching the Nautt webhook callback; it carries the verbatim beta decision and the exact pre-production reversal steps.*
- [[notes/weekly-review-2026-07-21|Weekly review 2026-07-21]] — *read when comparing harness health over time or when kanban evidence retention comes up again.*
