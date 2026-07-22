# Production runbook

This runbook operates the single-instance self-hosted QR Pagamentos deployment.
It describes the committed Docker Compose topology; it does not provide a proxy
configuration, create credentials, or certify a live deployment.

## Operating boundary

Compose publishes only the application at `127.0.0.1:${APP_PORT}:3000`.
PostgreSQL, `bootstrap`, `migrate`, and `identity-seed` have no host port, and
the database network is internal. Run one application instance for this
topology: the public payment-link limiter is intentionally bounded and
process-local, not a distributed protection.

Put a separately operated TLS reverse proxy in front of that loopback listener.
The proxy, not this repository, owns the public listener, certificates and TLS
redirects. It must reject direct public access to the loopback service and must
not expose PostgreSQL or a one-shot service.

Before forwarding each request, the proxy must remove any client-supplied
forwarding headers and replace them with its own values:

- `Host` is the canonical public host.
- `X-Forwarded-Host` is that same canonical public host, including a
  non-default public port where applicable.
- `X-Forwarded-For` is exactly the direct client IP literal, not an appended
  chain.
- The forwarded scheme represents TLS (`https`).

Appending an untrusted `X-Forwarded-For`, accepting a client-selected
`X-Forwarded-Host`, or allowing clients to reach a trusted proxy listener is an
abort condition. The application uses the former as a hashed rate-limit input
and the latter for authenticated POST origin comparison.

## Configuration and secret posture

Use either the self-contained `install/.env` flow or the lower-level
`.env.compose` flow; do not commit either populated file. Keep the PostgreSQL
administrator, migrator, and runtime passwords distinct. `MIGRATION_DATABASE_URL`
is migration-only and `DATABASE_URL` is runtime-only; the runtime wrapper
removes the migration URL before binding the app.

For the manual flow, point `.env.compose` at absolute, file-backed secret paths.
For the installer flow, use the ignored `install/.env`. Protect source secret
files with mode `0600` and secret directories with mode `0700`. The installer
stages files as application-owned read-only files (mode `0400`) and Compose
mounts them as secrets; never put their contents in command arguments, logs,
Git, this runbook, or release evidence.

The required webhook callback is a canonical absolute HTTPS URL. It is server
configuration, never derived from a request. The Nautt API base is optional;
when supplied it must be canonical absolute HTTPS with no credentials or
fragment, otherwise the committed production default applies. The Nautt
encryption key is a separate protected secret: store an independently protected
backup outside the host. A database backup without this key cannot recover
encrypted Nautt credentials.

The deployment seed requires an initial administrator username; its email is
optional contact information and is never a login credential. The installer
creates a protected initial password file once. Use
`install/install.sh --recover-initial-admin` only for the recorded initial
administrator: recovery targets its immutable UUID, reactivates its ADMIN role,
and rotates its credential without a username/email lookup.

## Deployment and startup

Prerequisites are Docker Engine and the Docker Compose v2 plugin, with the
invoking operator already authorized to use Docker. The installer does not
install Docker, grant privileges, or use `sudo`.

Review configuration and secret-file ownership before starting. The documented
manual sequence is secret staging, a digest-pinned Compose build, then `up -d`;
the installer performs its corresponding ignored-file flow without requiring
host Node.js or pnpm. Do not interpret a completed Compose command alone as
ready for traffic.

Startup is layered:

1. `db` must pass its PostgreSQL readiness probe.
2. `bootstrap`, `migrate`, and `identity-seed` must each exit successfully;
   they are one-shot gates and do not retry automatically.
3. App logs must contain `PASS runtime-db-preflight`, proving the runtime-role
   `SELECT 1` completed before the Next.js process binds.
4. `GET /api/health` returning the exact application liveness response proves
   only that the application process is live. It is not a database, migration,
   identity-seed, proxy, or checkout readiness assertion.

If a one-shot service fails, retain its logs and correct the external input or
configuration before explicitly recreating that service. Do not weaken a
secret-file permission to debug it. Structured completion logs are deliberately
redacted and use only the documented request-id and literal route templates;
keep proxy/access logs under a separate reviewed retention policy.

## Backup and restore

Take a protected logical PostgreSQL backup before every upgrade and on the
operator's retention schedule. Store with it only redacted metadata: release
revision, Compose/image identities, backup time, schema/migration expectation,
and configuration fingerprint without values. Preserve the separately protected
Nautt encryption-key backup with an access and retention policy at least as
strict as the database backup.

Restoration is isolated, operator-controlled, and destructive:

1. Stop the affected deployment while preserving logs and the pre-restore
   evidence.
2. Identify and review the exact backup, encryption key, intended database
   volume, and compatibility decision before touching data.
3. Restore only into that reviewed target with approved PostgreSQL tooling.
4. Re-establish the normal startup gates and then perform the human-approved
   operational checks.

Never use clean-clone test cleanup against an operator deployment. In
particular, `down --volumes`, `--purge-data`, and deleting a production volume
are not default backup, restore, upgrade, or rollback actions.

## Upgrade and rollback

After creating a fresh protected logical backup, update an installer-managed
deployment from the checked-out target release with:

```sh
install/update.sh \
  --backup-reference backup-2026-07-22T1800Z \
  --previous-release v1.2.3
```

The references are non-secret operator identifiers, not paths containing
credentials. The command does not create or validate the backup. It fails
before pull/build unless the local Compose volume labels and driver, owning
`db` container labels, and exact `/var/lib/postgresql` mount prove a compatible
existing installation. It also requires all protected source/staged artifacts
and exact agreement between the valid source, staged, and any populated
environment-file Nautt encryption key. It never creates or rewrites a secret.

Before `build --pull`, the command atomically writes a mode-`0400` record under
the ignored `.update-evidence/` directory (or `--evidence-dir`). The record
contains the supplied references, target Git revision and clean/dirty state,
current image/container and volume identities, a value-free configuration
fingerprint, and expected migration names/digest. It is rollback metadata, not
a database backup, and contains neither rendered configuration nor secret-file
paths or values. Preserve it with the independently protected backup.

After `up -d`, the command proves the volume identity again and requires zero
exits for bootstrap, migration, and identity seed, the runtime database
preflight log marker, and the exact application health check. If build,
startup, or health fails, it leaves containers, data, logs, and the pre-update
record intact. Diagnose with `docker compose -p qr-pagamentos ps` and redacted
service logs; do not rerun the installer, delete the volume, or rotate the
Nautt key as a recovery shortcut.

Application/configuration rollback is allowed only after reviewing schema
compatibility. Migrations are forward-only: never silently reverse one. If a
data rollback is required, stop and use the reviewed restore procedure with the
matching encryption key. `docker compose stop` and `docker compose down`
without `--volumes` preserve the named database volume; neither is proof that a
previous application can safely read the current schema.

## Release handoff

Read [release evidence](release-evidence.md) with the release candidate. It is
a static ledger, not operational proof. The listed runtime, installation,
container, database, browser, proxy, backup/restore, health, and full-gate
checks are explicitly `SKIPPED — user directed`; a human must plan and record
those checks before declaring the deployment operational.
