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
copy outside the host. A database copy without this key cannot recover
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

PostgreSQL and `media-data` are one consistency pair. Default uninstall retains
both volumes, protected credentials, backups/recovery sets, and deployment
identity. Never use clean-clone `down --volumes` against an operator project.

Create a backup only in an existing canonical directory outside the checkout,
owned by the invoking operator and mode `0700`:

```sh
install/backup.sh --destination /srv/qr-pagamentos-backups
```

The shared lock serializes every data operation. Backup requires a healthy
supported deployment, stops only app, captures a PostgreSQL custom dump,
validates the database-to-media descriptor/digest inventory, and creates a
numeric-owner media archive. It verifies the artifacts and atomically publishes
one protected set before restarting the exact prior app; failure publishes
nothing.

The closed manifest contains only release SHA, Compose project, exact managed
volume identities, schema expectation, formats, sizes, and checksums. It contains no
database row, media inventory, credential, secret path, or Docker mountpoint.
Preserve the Nautt key separately under a policy at least as strict as the set.

Restore is destructive, exact-release, and pair-only:

```sh
install/restore.sh \
  --backup /srv/qr-pagamentos-backups/qr-pair-YYYYMMDDTHHMMSSZ \
  --confirm RESTORE:qr-pagamentos
```

It checks the closed manifest, checksum/size, safe archive members, exact clean
checkout and local image SHA, manifest project/volume identities, and current exact
local Compose ownership. Before managed mutation it restores into labeled
disposable database/media volumes, one internal DB-only network, runs media
POSIX preflight, and boots exact-release internal health with operation-generated
mode-`0400` runtime/Nautt files and a fixed callback. No rehearsal resource
joins `edge`, publishes a port, mounts the Docker socket, reads a production
secret, or mounts a managed volume.

Every recorded rehearsal resource is removed and proven absent before mutation.
Restore then captures an automatic protected recovery pair and restores contents
into the same managed volume IDs. Requested-restore failure attempts recovery;
double failure leaves app stopped and retains all artifacts. Never broaden
cleanup or use force, partial, database-only, media-only, or ignore-version
modes. The clean-clone backup/restore scenarios passed on 2026-07-24.

## Upgrade and rollback

Update an installer-managed deployment with:

```sh
install/update.sh
```

Normal use takes no arguments. `--env-file <path>` and `--evidence-dir <path>`
only select existing installer configuration and protected evidence storage;
backup and previous-release options are absent and rejected. A backup may be
retained independently, but it is not an update prerequisite.

The checkout must be clean, including untracked files, attached to a branch,
and configured with a reachable upstream. The updater fetches that upstream,
rejects local-ahead, diverged, detached and non-fast-forward states, executes
`git pull --ff-only --no-rebase`, captures the resulting 40-character commit
SHA and re-executes the pulled updater exactly once. The handoff fails closed if
`HEAD` or the fetched upstream no longer equals that SHA. A per-checkout lock
serializes updates and the updater rechecks the target SHA and clean tree after
the policy gate and each mutable deployment boundary. Remote movement after
capture belongs to a later invocation. This design trusts the configured
upstream: protect it and require migration-policy, database, container and
quality gates before merge. Arbitrary or compromised upstream code cannot be
made safe by the updater it replaces.

The digest-pinned Node helper image must already exist locally. Before any
managed build or database operation, the updater runs the pulled
`migration-policy.mjs` with `--pull=never`, no network, a read-only source mount,
and no database mount, secret file or passed environment. The verifier pins the
exact 19-migration baseline through an independent reviewed inventory digest and accepts each later migration only when its
canonical closed manifest regenerates `migration.sql` byte for byte. That
language permits only data-preserving table, column, index, typed-constraint
and privilege operations; raw SQL, destructive DDL/DML, rename/type changes,
backfills and other arbitrary effects are not representable.

The updater proves both local Compose data volumes, owning mounts, a healthy
existing app, every PostgreSQL/Nautt source/staged/supplied credential, and
no-output authentication of all roles. An absent legacy media volume is adopted
only after an authenticated zero-`MediaObject` result. It never rewrites a
retained secret. It writes a protected record under
the ignored `.update-evidence/` directory (or `--evidence-dir`) containing the
target/head/upstream SHA, previous app container/image, Compose project and both
volume identities; no secret value or path is recorded.

Candidate db-ops and app images are labelled
`org.opencontainers.image.revision=<target SHA>`. The old healthy app remains
running while candidate images build and the target image preflights the
retained media volume. It remains healthy while bootstrap runs and a newly created
migration container performs normal `prisma migrate deploy`. The migration
wrapper rejects repository/applied-ID or checksum disagreement, failed,
rolled-back, incomplete or ambiguous Prisma history, and emits
`PASS migration-preflight` and `PASS migration-complete` with repository and
pending-set digests. Its image revision must equal the target SHA. Only after
that proof and a successful identity seed does the updater force-recreate the
app, require it to become healthy, verify the same image revision label and
recheck both unchanged volume identities. Completion emits
`PASS update-complete revision=<SHA> migrate=<container> app=<container>
evidence=<file>`.

Pull, offline-policy, ownership/continuity, build, or target-preflight failure
leaves the old app running with the pair unchanged. Once bootstrap, migration,
or seed commits database work, that additive state and its evidence are
retained; media remains unchanged and no database reversal is claimed. If target
health fails, update recreates only the captured previous image against the
retained pair and requires its health. Failure of that image requires operator
recovery with both image identities, logs, and evidence retained.

Application/configuration rollback is allowed only after reviewing schema
compatibility. The migration baseline is immutable and future changes are
generated only from the closed data-preserving manifest; correct schema with a
new policy-valid forward migration rather than reversing applied history. If a
data restore is required for an independent operational reason, stop and use
the reviewed restore procedure with the matching encryption key.
`docker compose stop` and `docker compose down`
without `--volumes` preserve both named data volumes; neither is proof that a
previous application can safely read the current schema.

## Release handoff

Read [release evidence](release-evidence.md) with the release candidate. It is
a static ledger, not operational proof. The listed runtime, installation,
container, database, browser, proxy, backup/restore, health, and full-gate
checks are explicitly `SKIPPED — user directed`; a human must plan and record
those checks before declaring the deployment operational.
