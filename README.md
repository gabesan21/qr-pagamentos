# QR Pagamentos

Self-hosted Next.js dashboard for products and first-party payment links backed by Nautt Finance PIX and international QR-code orders.

## Prerequisites

- Node.js 24.18.0 (also recorded in `.node-version`)
- pnpm 11.13.0; pnpm's managed-version support enforces the `packageManager` pin without Corepack
- For the self-contained `install/install.sh` deployment path: Docker Engine and the Docker Compose v2 plugin, installed per https://docs.docker.com/engine/install/ and https://docs.docker.com/compose/install/linux/, with the invoking user already a member of the `docker` group (`sudo usermod -aG docker "$USER"`, then log out and back in) — the installer runs entirely without `sudo` and errors out instead of granting or working around missing Docker access

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

`GET /api/health` is an unlocalized liveness probe. It returns HTTP 200, `Cache-Control: no-store`, and exactly `{"status":"ok"}`. Database, migration, and identity-seed readiness are separate startup gates.

## Database foundation

Prisma migrations use `MIGRATION_DATABASE_URL`; application code uses the distinct, least-privilege `DATABASE_URL`. Copy `.env.example` only as a variable-name reference and supply both credentials externally. Never reuse the migrator connection at runtime.

`pnpm db:generate` creates the ignored client in `src/generated/prisma/` without contacting a database. `pnpm db:test` creates and removes its own PostgreSQL 18.4 fixture, applies the committed migration as `qr_migrator`, and probes runtime access as `qr_runtime`. It never uses a developer database. `pnpm db:contract-check` verifies the static database and documentation contract.

`prisma/migrations/` is immutable migration history: create a new migration for later schema changes and never edit a migration already applied outside a disposable test database. The one task-specific pre-production rewrite exception is documented in `prisma/AGENTS.md`. CI must run `pnpm check` and `pnpm db:test` as separate required steps.

`GET /api/health` remains application-only liveness. PostgreSQL readiness, bootstrap completion, migration completion, and the runtime-role `SELECT 1` preflight are separate startup gating boundaries; a later liveness response makes no database-readiness claim.

## Production container startup

The self-contained installer reads passwords directly from the ignored `install/.env`. The lower-level manual Compose flow remains file-based through `.env.compose`.

With Docker Engine and the Compose v2 plugin already installed (see Prerequisites — the installer only verifies they are present), the self-contained operator flow performs secret staging and Compose startup without host Node.js or pnpm:

```sh
cp install/.env.example install/.env
# Replace all password placeholders, choose the initial-admin username, and optionally set its email.
install/install.sh
```

`install/.env` requires the non-secret `INITIAL_ADMIN_USERNAME`; `INITIAL_ADMIN_EMAIL` is optional contact data. The installer canonicalizes present values, generates the initial administrator password once, and reports only its protected path: `.install-secrets/initial_admin_password`. The deployment seed creates exactly one active `ADMIN` after migrations; reruns use its immutable deployment UUID and never rename it or fill its email from changed configuration. All generated files are ignored by Git and mounted read-only for the one-shot job.

Username and password are the only login credentials; email is optional and never used for login.

Server-side recovery is explicit and file-only. It restores the originally seeded UUID to active `ADMIN` and rotates its credential without using username/email lookup, changing either identity field, creating another user, or exposing the password in arguments, environment variables, or output:

```sh
install/install.sh --recover-initial-admin
```

On success the retry-stable candidate replaces `.install-secrets/initial_admin_password`; on failure it remains protected for the identical retry. Recovery aborts if the original UUID was deleted. Email delivery, public reset, login UI, sessions, and MFA are not part of this slice.

`install/uninstall.sh` removes application containers while preserving the PostgreSQL volume. Data deletion is a separate explicit operation:

```sh
install/uninstall.sh
install/uninstall.sh --purge-data
```

```sh
cp .env.compose.example .env.compose
chmod 0600 /absolute/path/to/postgres-admin-password /absolute/path/to/qr-migrator-password /absolute/path/to/qr-runtime-password
# Also prepare mode-0600 canonical-username, optional-email marker, and generated initial-password files,
# then set their absolute paths in .env.compose.
pnpm container:prepare-secrets -- --env-file .env.compose
docker compose --env-file .env.compose build --pull
docker compose --env-file .env.compose up -d
docker compose --env-file .env.compose ps
docker compose --env-file .env.compose logs --no-color bootstrap migrate identity-seed app
```

Only the application is published, on `127.0.0.1:${APP_PORT}`. PostgreSQL and the one-shot jobs have no host ports. A healthy `db` means PostgreSQL accepts readiness probes; successful `bootstrap`, `migrate`, and `identity-seed` exits prove their one-shot gates; application logs must show `PASS runtime-db-preflight` before bind; `GET /api/health` then proves only the Next.js process is live. The app and database run non-root after official PostgreSQL initialization.

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
