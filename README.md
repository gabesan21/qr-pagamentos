# QR Pagamentos

Self-hosted Next.js dashboard for products and first-party payment links backed by Nautt Finance PIX and international QR-code orders.

## Prerequisites

- Node.js 24.18.0 (also recorded in `.node-version`)
- pnpm 11.13.0; pnpm's managed-version support enforces the `packageManager` pin without Corepack

## Commands

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm start
pnpm check
```

`pnpm check` runs typechecking, linting, tests, and the production build. The explicit application routes are `/pt-BR` and `/en`.

`GET /api/health` is an unlocalized liveness probe. It returns HTTP 200, `Cache-Control: no-store`, and exactly `{"status":"ok"}`. Database and migration readiness remain deferred to tasks 1.1.2 and 1.1.3.

See `PROJECT.md`, `ROADMAP.md`, and `AGENTS.md` before changing the application or harness.

Nautt Finance source documentation should be placed in `researches/nautt-finance/raw/` without credentials or production data.
