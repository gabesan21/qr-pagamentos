# QR Pagamentos

- **Category:** [[applications/qr-pagamentos/ROADMAP|Roadmap]]

## Objective

Deliver a production-ready dashboard where users create products and their own PIX or international QR-code payment links, while Nautt Finance converts fiat proceeds to USDT in each user's wallet. Success means every scoped workflow is tested and functional in a self-hosted deployment.

## Context

The application owns the catalog, payment-link lifecycle, public checkout, and order views. Nautt Finance is used only to open and query orders and receive webhooks; its hosted payment-link feature is explicitly forbidden. The repository currently contains no application code, so the roadmap starts from a clean foundation.

## Folder structure

This is an `included` project: application code and the complete PoP harness share the repository root. Nautt documentation supplied by the user belongs in `researches/nautt-finance/raw/`; ingest it before planning the provider integration.

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
