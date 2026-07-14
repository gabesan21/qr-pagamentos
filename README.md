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
pnpm db:generate
pnpm db:test
pnpm db:contract-check
```

`pnpm check` runs typechecking, linting, tests, and the production build. The explicit application routes are `/pt-BR` and `/en`.

`GET /api/health` is an unlocalized liveness probe. It returns HTTP 200, `Cache-Control: no-store`, and exactly `{"status":"ok"}`. Database and migration readiness remain deferred to tasks 1.1.2 and 1.1.3.

## Database foundation

Prisma migrations use `MIGRATION_DATABASE_URL`; application code uses the distinct, least-privilege `DATABASE_URL`. Copy `.env.example` only as a variable-name reference and supply both credentials externally. Never reuse the migrator connection at runtime.

`pnpm db:generate` creates the ignored client in `src/generated/prisma/` without contacting a database. `pnpm db:test` creates and removes its own PostgreSQL 18.4 fixture, applies the committed migration as `qr_migrator`, and probes runtime access as `qr_runtime`. It never uses a developer database. `pnpm db:contract-check` verifies the static database and documentation contract.

`prisma/migrations/` is immutable migration history: create a new migration for later schema changes and never edit a migration already applied outside a disposable test database. CI must run `pnpm check` and `pnpm db:test` as separate required steps.

`GET /api/health` remains application-only liveness. Task 1.1.3 owns PostgreSQL readiness and startup gating on a successful `prisma migrate deploy`; the fixture image here is not production container configuration.

See `PROJECT.md`, `ROADMAP.md`, and `AGENTS.md` before changing the application or harness.

Nautt Finance source documentation should be placed in `researches/nautt-finance/raw/` without credentials or production data.
