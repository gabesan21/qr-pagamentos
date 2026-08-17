# QR Pagamentos - agent instructions

> Project managed by the **ProjectOfProjects (PoP)** workflow. `CLAUDE.md` is a symlink to this file; always edit this file.

- **Scope:** this repository is the whole scope of the workflow — the harness in `pop/` travels with it and **nothing above this root belongs to it**.
- **Project language:** English — specs, notes, research, code comments, and kanban artifacts use English.
- **Vendored PoP language:** copied core workflow files and skills remain in upstream pt-BR; do not translate the shared source during project work.
- **Supported application languages (i18n):** Brazilian Portuguese (`pt-BR`) and English (`en`).
- **Project brief:** [[PROJECT|PROJECT]] · **Roadmap:** [[ROADMAP|ROADMAP]] · **Modifications:** [[MODIFICATIONS|MODIFICATIONS]]

## Repository

| Repo | URL | Clone path | PR branch |
|------|-----|------------|-----------|
| qr-pagamentos | https://github.com/gabesan21/qr-pagamentos.git | repository root | main |

Yolo scopes integrate task branches into `develop`; the final `develop` -> `main` PR opens when the scope closes.

## Workflow

Changes go through `pop/kanban/` (`001_initial_task` -> `005_closing`) by default; yolo or roadmap/modification items imply the kanban. Opting out uses the plan-mode route, which skips the card but never tracking (memory `D-` ledger + entries + specs/DOX sync). Read [[WORKFLOW|WORKFLOW]] for triage, stages, gates, yolo route, and return paths.

**Principal delegation-first (`sempre delega`):** there is no materialized `pop-orchestrator`; the main agent delegates to `pop-planner`, `pop-recon`, `pop-execution-orchestrator`, `pop-executor`, `pop-judge-dredd`, and `pop-phase-verifier`, except for direct work that is punctual and simple. Each specialist acquires its own context from the envelope paths, and only the main agent integrates results.

- **Delivery:** task branches integrate into `develop`; the scope closes with the `develop` -> `main` PR.
- **Gates:** tests run only in each phase's final `phase-verification` task, always via **direct pnpm** (`pnpm check`) — ordinary tasks are judged by reading, without test runs ([[WORKFLOW|WORKFLOW]] › phase verification). Docker-dependent checks are user-exclusive (see Project verification).
- **Context:** read the affected `pop/specs/` documents and walk the DOX tree before editing code; unresolved uncertainty is `RECON NEEDED` or `blocked`, never a guess.

## Skills

`.agents/skills/` owns PoP workflow skills; `skills/` will own project operations procedures as they become real.

## DOX index

Walk this tree before editing any subtree; the closest `AGENTS.md` wins on local details and never weakens a parent rule. The generic DOX process lives in [[WORKFLOW|WORKFLOW]].

- [`prisma/AGENTS.md`](prisma/AGENTS.md) — schema, bootstrap SQL, and immutable migration history.
- [`src/app-shell/AGENTS.md`](src/app-shell/AGENTS.md) — role-neutral shell composition, navigation state, and mobile boundary.
- [`src/brand/AGENTS.md`](src/brand/AGENTS.md) — canonical identity geometry, compositions, generated assets, manifest, and usage rules.
- [`src/components/ui/AGENTS.md`](src/components/ui/AGENTS.md) — owned Radix/nova shadcn source, inventory, and state contract.
- [`src/integrations/nautt/AGENTS.md`](src/integrations/nautt/AGENTS.md) — Nautt HTTP adapters and owner-bound provider orchestration.
- [`src/checkout/AGENTS.md`](src/checkout/AGENTS.md) — sessionless public checkout reservation, replay, and capability issuance.
- [`src/media/AGENTS.md`](src/media/AGENTS.md) — media validation, persistence, lifecycle, reconciliation, and serving.
- [`src/data-directory/AGENTS.md`](src/data-directory/AGENTS.md) — bounded query/cursor contracts and reusable responsive directory states.
- [`container/AGENTS.md`](container/AGENTS.md) — startup, media preflight/inventory, one-shot, and health wrappers.
- [`install/AGENTS.md`](install/AGENTS.md) — install, update, retention, purge, backup, restore, and recovery operations.

### Clean code

- `clean-code-change` — follow when **planning (002) and executing (004)** any code task.
- `clean-code-review` — follow when **verifying (005)** a code task.
- **Mandatory:** in 002, every code task enters `clean-code-change` on the **004** row and `clean-code-review` on the **005** row of the card's **Skills por etapa** table.

### UI and frontend

- `ui-change` — follow when **planning (002) and executing (004)** any UI task.
- `ui-review` — follow when **verifying (005)** any UI task.
- **Mandatory:** in 002, every UI task enters `ui-change` on the **004** row and `ui-review` on the **005** row.

#### Project verification

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` independently, or `pnpm check` for the aggregate gate — always **direct pnpm, never through containers**. Anything Docker-dependent (`pnpm db:test`, `pnpm container:*`, `install/test.sh`, compose files) is **user-exclusive**: it enters the human verification checklist (`verify: user`) and is never executed by the agent — except on a direct, explicit user request (see Essential rules).

## Application contract

Username and password are the only login credentials; email is optional and never used for login.

The operational contracts below are owned by the listed subtree or spec. Do not reintroduce removed capabilities, leak secrets, or bypass role boundaries.

- **Identity & security:** [`pop/specs/identity-security.md`](pop/specs/identity-security.md)
- **Administration:** [`pop/specs/administrative-foundation.md`](pop/specs/administrative-foundation.md)
- **Design system:** [`pop/specs/application-frontend-system.md`](pop/specs/application-frontend-system.md), [`src/brand/AGENTS.md`](src/brand/AGENTS.md), [`src/components/ui/AGENTS.md`](src/components/ui/AGENTS.md)
- **Catalog & payment links:** [`pop/specs/catalog-and-payment-links.md`](pop/specs/catalog-and-payment-links.md)
- **Checkout & order lifecycle:** [`pop/specs/checkout-and-order-lifecycle.md`](pop/specs/checkout-and-order-lifecycle.md), [`src/checkout/AGENTS.md`](src/checkout/AGENTS.md)
- **Storefront & customization:** [`pop/specs/storefront-and-customization.md`](pop/specs/storefront-and-customization.md)
- **Media storage:** [`pop/specs/media-storage.md`](pop/specs/media-storage.md), [`src/media/AGENTS.md`](src/media/AGENTS.md)
- **Nautt integration:** [`pop/specs/nautt-finance-integration.md`](pop/specs/nautt-finance-integration.md), [`src/integrations/nautt/AGENTS.md`](src/integrations/nautt/AGENTS.md)
- **Data directory:** [`src/data-directory/AGENTS.md`](src/data-directory/AGENTS.md)
- **App shell:** [`src/app-shell/AGENTS.md`](src/app-shell/AGENTS.md)
- **Install & operations:** [`install/AGENTS.md`](install/AGENTS.md), [`container/AGENTS.md`](container/AGENTS.md)

Use the exact Node and pnpm pins in `.node-version` and `package.json`; install with `pnpm install --frozen-lockfile`. `MIGRATION_DATABASE_URL` is migration-only and `DATABASE_URL` is runtime-only; never share credentials or commit usable URLs. Generated Prisma code lives in ignored `src/generated/prisma/`; never edit or commit it. Never edit generated `next-env.d.ts`, `.next/`, `node_modules/`, coverage output, or TypeScript build-info files by hand.

## Essential rules

- Use English for project content and ISO dates (`YYYY-MM-DD`). Use wikilinks for internal references and keep notes near 150 lines.
- The project's Docker containers (`Dockerfile`, `compose*.yaml`, `container/`, `install/`) exist solely for the **user's installation** of the product and are **user-exclusive**: the AI agent never uses them for anything — no builds, runs, tests, or checks through containers. Build/test verification is always direct pnpm. **Sole exception:** the agent may use Docker only on a direct, explicit user request naming it, in that request's scope — never by inference or as part of a task/yolo flow.
- Never implement or modify application behavior outside a task in `004_processing` with an approved plan.
- Never use Nautt Finance hosted payment links; this application owns its products, links, and checkout pages.
- Never expose Nautt API keys, session secrets, or webhook secrets to clients or committed files.
- Never execute an item owned by `(user)`.
- Every completed task writes `memory/<id>.md` with dates and the final commit.
