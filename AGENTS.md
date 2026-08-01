# QR Pagamentos - agent instructions

> Project managed by the **ProjectOfProjects (PoP)** workflow. `CLAUDE.md` is a symlink to this file; always edit this file.

- **Scope:** this repository is the whole workflow scope; nothing above the root belongs to it.
- **Project language:** English for specs, notes, comments, and kanban artifacts.
- **Vendored PoP language:** copied core workflow files/skills stay in upstream pt-BR.
- **Supported i18n:** Brazilian Portuguese (`pt-BR`) and English (`en`).
- **Project brief:** [[PROJECT|PROJECT]]; **Roadmap:** [[ROADMAP|ROADMAP]]; **Modifications:** [[MODIFICATIONS|MODIFICATIONS]].

## Repository

| Repo | URL | Clone path | PR branch |
|------|-----|------------|-----------|
| qr-pagamentos | https://github.com/gabesan21/qr-pagamentos.git | repository root | main |

In yolo scopes the orchestrator integrates task branches into `develop`; the final `develop` -> `main` PR opens when the scope closes.

## Workflow
Every change flows through `pop/kanban/` (`001_initial_task` -> `005_closing`) via `new-task` -> `advance-task`; read [[WORKFLOW|WORKFLOW]]. Code tasks pass `pnpm check` (plus `pnpm db:test`, `pnpm container:contract-check`, or `install/test.sh` when relevant) and require walking the DOX tree and reading affected `pop/specs/` before editing.

## DOX index

[`src/app-shell/AGENTS.md`](src/app-shell/AGENTS.md) · [`src/brand/AGENTS.md`](src/brand/AGENTS.md) · [`src/components/ui/AGENTS.md`](src/components/ui/AGENTS.md) · [`src/integrations/nautt/AGENTS.md`](src/integrations/nautt/AGENTS.md) · [`src/checkout/AGENTS.md`](src/checkout/AGENTS.md) · [`src/media/AGENTS.md`](src/media/AGENTS.md) · [`src/data-directory/AGENTS.md`](src/data-directory/AGENTS.md) · [`container/AGENTS.md`](container/AGENTS.md) · [`install/AGENTS.md`](install/AGENTS.md) · [`prisma/AGENTS.md`](prisma/AGENTS.md)

#### Project verification

| Check | Command |
|-------|---------|
| Formatter | — (none in `package.json`) |
| Linter | `pnpm lint` (plus `pnpm typecheck`) |
| Tests | `pnpm test` |

Aggregate gate: `pnpm check` — see Application contract.

## Application contract

Username and password are the only credentials; email is optional and never used for login.

- Role routing and admin surface: [`pop/specs/administrative-foundation.md`](pop/specs/administrative-foundation.md).
- Orders, V2 lifecycle, and analytics: [`pop/specs/checkout-and-order-lifecycle.md`](pop/specs/checkout-and-order-lifecycle.md).
- Payment links (V1 frozen), products, and categories: [`pop/specs/catalog-and-payment-links.md`](pop/specs/catalog-and-payment-links.md).
- Storefront, cart, and standalone payments: [`pop/specs/storefront-and-customization.md`](pop/specs/storefront-and-customization.md).
- Media lifecycle: [`pop/specs/media-storage.md`](pop/specs/media-storage.md).
- Identity, security, and Nautt integration: [`pop/specs/identity-security.md`](pop/specs/identity-security.md), [`pop/specs/nautt-finance-integration.md`](pop/specs/nautt-finance-integration.md).

Guard owners without dedicated specs:

- `src/app/origin-guard.ts` — fail-closed same-origin check for cookie-authenticated POSTs.
- `src/security/public-rate-limit.ts` — bounded single-process limiter for public payment/store routes.
- `src/observability/server-request-log.ts` — server-only completion record for the closed API inventory.
- `next.config.ts` — static security headers; CSP is deferred.

BETA(M-5.1): `/api/nautt/webhooks` currently accepts bodies WITHOUT HMAC verification — MUST be reversed before production; see `pop/open_questions/2026-07-25-pre-production-gate-restore-webhook-hmac.md`.

DOX contract guide: [[notes/dox-contract-guide|DOX contract guide]].

## Essential rules
Use English, ISO dates, and wikilinks; never implement outside an approved `004_processing` plan, use Nautt hosted links, expose secrets, or execute items owned by `(user)`. Every completed task writes `memory/<id>.md` with dates and the final commit.
