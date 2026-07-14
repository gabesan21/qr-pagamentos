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
pnpm container:prepare-secrets -- --env-file .env.compose
pnpm container:contract-check
pnpm container:test --clean-clone --scenario happy
```

`pnpm check` runs typechecking, linting, tests, and the production build. The explicit application routes are `/pt-BR` and `/en`.

`GET /api/health` is an unlocalized liveness probe. It returns HTTP 200, `Cache-Control: no-store`, and exactly `{"status":"ok"}`. Database and migration readiness remain deferred to tasks 1.1.2 and 1.1.3.

## Database foundation

Prisma migrations use `MIGRATION_DATABASE_URL`; application code uses the distinct, least-privilege `DATABASE_URL`. Copy `.env.example` only as a variable-name reference and supply both credentials externally. Never reuse the migrator connection at runtime.

`pnpm db:generate` creates the ignored client in `src/generated/prisma/` without contacting a database. `pnpm db:test` creates and removes its own PostgreSQL 18.4 fixture, applies the committed migration as `qr_migrator`, and probes runtime access as `qr_runtime`. It never uses a developer database. `pnpm db:contract-check` verifies the static database and documentation contract.

`prisma/migrations/` is immutable migration history: create a new migration for later schema changes and never edit a migration already applied outside a disposable test database. CI must run `pnpm check` and `pnpm db:test` as separate required steps.

`GET /api/health` remains application-only liveness. PostgreSQL readiness, bootstrap completion, migration completion, and the runtime-role `SELECT 1` preflight are separate startup gating boundaries; a later liveness response makes no database-readiness claim.

## Production container startup

Create three distinct password files outside the repository. Each must be an absolute path to a regular file owned by the user invoking Docker and have mode `0600`. Copy `.env.compose.example` to `.env.compose` and set only those paths plus the loopback application port; never place a password or database URL in it.

For a fresh Debian or Ubuntu host, the self-contained operator flow installs Docker from its official APT repository and performs the same secret staging and Compose startup without host Node.js or pnpm:

```sh
cp install/.env.install.example install/.env.install
chmod 0600 /absolute/path/to/postgres-admin-password /absolute/path/to/qr-migrator-password /absolute/path/to/qr-runtime-password
install/install.sh
```

Edit `install/.env.install` before running the installer. It contains paths and a loopback port, never password values. `install/uninstall.sh` removes application containers while preserving the PostgreSQL volume and Docker packages. Data deletion and Docker package removal are separate explicit operations:

```sh
install/uninstall.sh
install/uninstall.sh --purge-data
install/uninstall.sh --remove-docker
```

```sh
cp .env.compose.example .env.compose
chmod 0600 /absolute/path/to/postgres-admin-password /absolute/path/to/qr-migrator-password /absolute/path/to/qr-runtime-password
pnpm container:prepare-secrets -- --env-file .env.compose
docker compose --env-file .env.compose build --pull
docker compose --env-file .env.compose up -d
docker compose --env-file .env.compose ps
docker compose --env-file .env.compose logs --no-color bootstrap migrate app
```

Only the application is published, on `127.0.0.1:${APP_PORT}`. PostgreSQL and the one-shot jobs have no host ports. A healthy `db` means PostgreSQL accepts readiness probes; successful `bootstrap` and `migrate` exits prove their one-shot gates; application logs must show `PASS runtime-db-preflight` before bind; `GET /api/health` then proves only the Next.js process is live. The app and database run non-root after official PostgreSQL initialization.

Inspect or stop the deployment without deleting operator data:

```sh
docker compose --env-file .env.compose ps
docker compose --env-file .env.compose logs --no-color db bootstrap migrate app
docker compose --env-file .env.compose stop
docker compose --env-file .env.compose start
```

If bootstrap, migration, or runtime authentication fails, correct the external file, rerun secret staging, and explicitly recreate the failed service. One-shot failures remain visible and never retry automatically.

## Rollback without deleting data

Restore the previous digest-pinned application image/configuration and recreate only the affected service. Do not run `down --volumes`: `docker compose stop` and `docker compose down` without `--volumes` preserve the named PostgreSQL volume. Database migration rollback requires an explicit reviewed forward migration; never silently reverse or erase an existing volume.

```sh
docker compose --env-file .env.compose down
pnpm container:prepare-secrets -- --env-file .env.compose --clean
```

## Test-only destructive cleanup

The clean-clone harness creates uniquely labeled disposable projects and always runs `down --volumes --remove-orphans --rmi local`. That destructive volume removal is test-only and must never target an operator project.

```sh
pnpm container:test --clean-clone --scenario build
pnpm container:test --clean-clone --scenario config
pnpm container:test --clean-clone --scenario happy
pnpm container:test --clean-clone --scenario roles
pnpm container:test --clean-clone --scenario failures
pnpm container:test --clean-clone --scenario lifecycle
pnpm container:test --clean-clone --scenario isolation
```

## Critical verification in 005

Only during stage 005, create fresh disposable secret files and follow the production startup block. Confirm both `http://127.0.0.1:${APP_PORT}/pt-BR` and `/en`, then `GET /api/health`; inspect successful one-shot exits, non-root app/PostgreSQL server users, absence of a published database port, and a second runtime preflight after restarting only app. Finish with the documented test-only cleanup and verify the disposable project has no containers, networks, or volumes. Keep the human `Feito` item unchecked until that stage.

See `PROJECT.md`, `ROADMAP.md`, and `AGENTS.md` before changing the application or harness.

Nautt Finance source documentation should be placed in `researches/nautt-finance/raw/` without credentials or production data.
