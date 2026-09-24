# QR Pagamentos

- **Category:** [[ROADMAP|Roadmap]]

## Objective

Deliver a production-ready dashboard where users create products and their own PIX or international QR-code payment links, while Nautt Finance converts fiat proceeds to USDT in each user's wallet. Success means every scoped workflow is tested and functional in a self-hosted deployment.

## Context

The application owns the catalog, payment-link lifecycle, public checkout, and order views. Nautt Finance is used only to open and query orders and receive webhooks; its hosted payment-link feature is explicitly forbidden.

## Current state (2026-09-23)

The repository holds a working Next.js application in `src/` plus `prisma/`, `container/`, and `install/`. Epochs 1 to 11 are delivered and integrated: self-hosted runtime, identity and access control, the bilingual `pt-BR`/`en` admin and merchant panels, the Nautt provider integration (orders, polling, webhook intake and recovery), the administrator catalog and dynamic supported-exchange-currency registry, merchant products/categories/media, Commerce V2 payment links and generalized orders, the public storefront with cart and standalone payments, the branded public checkout with its terminal states, the administrator operations surface (analytics dashboard, global order and payment-link directories, user directory and profile editor, soft-delete lifecycle, settings hub), and identity security and release (password recovery, 2FA, role isolation, visual quality, production upgrade/recovery readiness). PR #9 (`develop` → `main`, "Epochs 10–11") was merged on 2026-07-31.

Epochs 12 to 15 are also delivered and integrated. Epoch 12 replaced the complete application frontend with the supplied professional template while preserving the existing stack and business contracts; Epoch 14 converged every surface onto that template's interaction model, vocabulary, and states, proven by rendered comparison; Epoch 15 removed the V1 payment-link/order/checkout-attempt line integrally (rebasing the migration baseline to 16 directories through `20260721060000_storefront_settings`, task 15.1.2), fixed PIX data durability, and gave the checkout explicit no-retry terminal states. **The deployment is V2-only:** Commerce V2 payment links and orders (`payment_link_v2`, `order_v2`, `checkout_attempt_v2`, `standalone_checkout_attempt`) are the sole checkout surface; no V1 table or route remains.

Provider reconciliation and checkout polling follow [[pop/specs/checkout-and-order-lifecycle|Checkout and order lifecycle]] and [[pop/specs/nautt-finance-integration|Nautt Finance integration]]: dispatch opens one reservation transaction, a `markCreating` CAS, one quote, one onramp `POST` attached to the V2 order identity, and `markPending` moves the order to `PENDING`; every post-dispatch ambiguity is durably `INDETERMINATE`, never retried, with no transaction spanning provider I/O. Settlement is webhook-driven: an authoritative owner-bound `GET /orders/{uuid}` reconciliation matches owner, provider UUID, and reconciliation version before any state write, and the same transition policy is reused by webhook-authoritative reads and injected polling/recovery.

Webhook HMAC verification, owner binding, and the `401` unauthenticated-rejection surface were restored by Epoch 13 phase 13.1 (concluded 2026-09-23), reversing the 2026-07-25 BETA(M-5.1) exception; no beta caveat remains in the webhook intake contract. Epoch 13 (pre-production hardening) is otherwise in progress: phases 13.1 and 13.2 are concluded; phase 13.3 (deployment truth and release gates, this task included) and phase 13.4 (provider configuration trust) are open.

The three accepted production caveats — none of them "deferred" — are recorded once in [[pop/notes/decisions/2026-09-23-epoch-13-decisions|the 2026-09-23 decisions]]; see also [[../AGENTS.md|project AGENTS]].

## Folder structure

This is an `included` project: application code lives at the repository root (`src/`, `prisma/`, `container/`, `install/`, `scripts/`, `tests/`) and the complete PoP harness lives in `pop/`. Nautt documentation supplied by the user belongs in `pop/researches/nautt-finance/raw/`, already ingested for the provider integration.

## Agent harness

- **Type and repository:** declared in [[../AGENTS.md|project AGENTS]]; task PRs target `develop` inside yolo phases and final phase PRs target `main`.
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
- **2026-09-22:** Remove the V1 payment-link/checkout/order line integrally (never a product, no legacy), forbid every retry rule in the checkout, hide the customer block for policy `NONE`, and fix PIX integrity — Epoch 15, with destructive migration authorization for the persistence task.

### Decision notes

- [[notes/decisions/2026-07-13-project-foundation|Project foundation]] — *read before reopening the product boundary, stack, delivery route, or the Nautt pricing/wallet allowances.*
- [[notes/decisions/2026-07-14-installer-simplification|Installer simplification]] — *read before adding host privilege escalation, OS package management, or `sudo` to `install/`.*
- [[notes/decisions/2026-07-20-multi-agent-workflow|Multi-agent workflow adoption]] — *read before changing planner/executor roles, ownership rules, or the single fresh-context review gate.*
- [[notes/decisions/2026-07-25-beta-unverified-webhook-intake|Beta unverified webhook intake]] — *read before touching the Nautt webhook callback; it carries the verbatim beta decision and the exact pre-production reversal steps.*
- [[notes/decisions/2026-09-22-v1-removal-and-checkout-decisions|V1 removal and checkout decisions]] — *read before touching V1 remnants, checkout retry semantics, the customer-data block or migration destructiveness.*
- [[notes/weekly-review-2026-07-21|Weekly review 2026-07-21]] — *read when comparing harness health over time or when kanban evidence retention comes up again.*
