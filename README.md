# QR Pagamentos

Self-hosted Next.js dashboard for products and first-party payment links backed by Nautt Finance PIX and international QR-code orders.

## Production operations

Operators should follow the [production runbook](docs/production-runbook.md) and
review the redacted [release evidence ledger](docs/release-evidence.md) before
deploying. The ledger separates historical candidate skips from later dated
disposable task evidence; neither is live-deployment certification, and every
remaining skip requires human execution.

## Prerequisites

- Node.js 26.4.0 (also recorded in `.node-version`)
- pnpm 11.3.0; pnpm's managed-version support enforces the `packageManager` pin without Corepack
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
pnpm db:migration-policy
pnpm db:test
pnpm db:contract-check
pnpm container:prepare-secrets -- --env-file .env.compose
pnpm container:contract-check
pnpm container:test --clean-clone --scenario happy
pnpm container:test --clean-clone --scenario install-lifecycle
pnpm container:test --clean-clone --scenario media-backup
pnpm container:test --clean-clone --scenario media-restore
```

`pnpm check` runs typechecking, linting, tests, and the production build. User-interface and mutation routes are unprefixed; persisted preferences select `pt-BR` or `en`, and legacy locale-prefixed routes return 404.

`GET /api/health` is an unlocalized liveness probe. It returns HTTP 200, `Cache-Control: no-store`, and exactly `{"status":"ok"}`. Database, migration, and identity-seed readiness are separate startup gates.

## Database foundation

Prisma migrations use `MIGRATION_DATABASE_URL`; application code uses the distinct, least-privilege `DATABASE_URL`. Copy `.env.example` only as a variable-name reference and supply both credentials externally. Never reuse the migrator connection at runtime.

`pnpm db:generate` creates the ignored client in `src/generated/prisma/` without contacting a database. `pnpm db:test` creates and removes its own PostgreSQL 18.4 fixture, applies the committed migration as `qr_migrator`, and probes runtime access as `qr_runtime`. It never uses a developer database. `pnpm db:contract-check` verifies the static database and documentation contract.

The 19 migration directories through `20260721060000_storefront_settings` are an immutable baseline pinned by ID and SHA-256, with the verifier independently binding the reviewed baseline inventory digest so it cannot be co-edited with its SQL. Every later migration must contain only a canonical `migration.safe.json` and the byte-exact `migration.sql` generated from it. The closed manifest language permits only data-preserving table, column, index, typed-constraint, and privilege operations; it has no raw SQL or destructive/data-rewrite operation. Generate future SQL with `node pop/scripts/migration-policy.mjs generate <migration.safe.json>` and verify the whole history with `pnpm db:migration-policy`. CI must run `pnpm check` and `pnpm db:test` as separate required steps.

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

Update an existing compatible installer deployment from a clean attached Git
branch whose tracked upstream is protected by the required migration and
quality gates. The command fetches and fast-forwards that branch to its latest
upstream commit, then binds policy verification, images, migration evidence and
the promoted app to that exact SHA:

```sh
install/update.sh
```

Use `--env-file <path>` when the deployment does not use `install/.env`, and
`--evidence-dir <path>` to override the ignored `.update-evidence/` directory.
Backup and previous-release arguments do not exist and are rejected. A backup
may still belong to an operator's independent retention policy, but it is not
an update prerequisite. The updater requires the digest-pinned Node helper
image to be available locally, then runs the pulled migration-policy verifier
offline with a read-only checkout and no network, database, environment or
secret access. It verifies both exact local Compose-owned data volumes, every
PostgreSQL and Nautt source/staged/supplied credential, and no-output role
authentication without generating or rewriting secrets. The target app image
runs its media POSIX preflight against the retained volume before any target
database command.

Candidate images carry `org.opencontainers.image.revision=<target SHA>`. The
currently healthy app remains running while they build and while a fresh
migration container checks repository/Prisma metadata and applies pending
migrations. Only after that container completes successfully and the identity
seed succeeds does the updater recreate the app from the target image. Pull,
policy, build or pre-database failure retains the prior healthy app and pair
unchanged. After bootstrap/migration/seed begins, committed additive database
state and failure evidence are retained honestly while media stays unchanged.
If the promoted target misses health, update recreates only the captured
previous application image against that retained pair; it never claims to
reverse database state.

`install/uninstall.sh` removes application containers/networks while preserving
both PostgreSQL and media volumes, source/staged credentials, and recovery
material. Data deletion is a separate exact-confirm paired operation:

```sh
install/uninstall.sh
install/uninstall.sh --purge-data qr-pagamentos
```

The steady app alone mounts `media-data` read-write at `/app/media`; its root
filesystem remains read-only and UID/GID `1000:1000`. Startup refuses to bind
until the private `0700` media directories pass the local-POSIX preflight.

Create one protected database/media backup set in an existing, external,
invoking-user-owned mode-`0700` directory:

```sh
install/backup.sh --destination /srv/qr-pagamentos-backups
```

Backup stops only app for the consistency cut, verifies the database-to-media
descriptor/digest inventory, and atomically publishes a custom PostgreSQL dump,
numeric media archive, and redacted checksum manifest before restarting the
same app. Restore is explicit, destructive, exact-release, and pair-only:

```sh
install/restore.sh \
  --backup /srv/qr-pagamentos-backups/qr-pair-YYYYMMDDTHHMMSSZ \
  --confirm RESTORE:qr-pagamentos
```

The checkout and local app image must match the manifest SHA. Restore verifies
checksums and safe archive members, rehearses the dump, media POSIX boundary,
and exact internal health using only labeled disposable resources, then proves
that inventory absent before touching managed volumes. It first captures a
protected automatic recovery pair; double failure leaves app stopped with all
artifacts retained. No force, partial, database-only, media-only, or
ignore-version mode exists. Runtime scenario PASS is not claimed here.

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

Restore a compatible previous digest-pinned application image/configuration and recreate only the affected service. Do not run `down --volumes`: `docker compose stop` and `docker compose down` without `--volumes` preserve both named data volumes. Schema correction requires a new reviewed, policy-valid forward migration; never alter the immutable baseline, reverse applied history, or erase an existing volume.

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
pnpm container:test --clean-clone --scenario install-lifecycle
pnpm container:test --clean-clone --scenario update
pnpm container:test --clean-clone --scenario media-backup
pnpm container:test --clean-clone --scenario media-restore
```

## Critical verification in 005

Only during stage 005, create fresh disposable secret files and follow the production startup block. Confirm both `http://127.0.0.1:${APP_PORT}/pt-BR` and `/en`, then `GET /api/health`; inspect successful one-shot exits, non-root app/PostgreSQL server users, absence of a published database port, and a second runtime preflight after restarting only app. Finish with the documented test-only cleanup and verify the disposable project has no containers, networks, or volumes. Keep the human `Feito` item unchecked until that stage.

See `PROJECT.md`, `ROADMAP.md`, and `AGENTS.md` before changing the application or harness.

Nautt Finance source documentation should be placed in `researches/nautt-finance/raw/` without credentials or production data.
