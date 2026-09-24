# Release evidence

## Candidate identity

| Field | Value |
|---|---|
| Release identifier | `qr-pagamentos-rc-2026-07-21-5d0f1a7` |
| Source revision | `5d0f1a771ec615216ca54909b107b031bbae2760` |
| Scope | Epoch 5, task 5.5.1 production operations documentation |
| Evidence type | Redacted static source/document audit |
| Operational certification | Not claimed |
| Final release integration | Occurs during task merge/closeout; this ledger binds the immutable documentation release commit, not a pre-integration branch state. |

No credentials, account identifiers, customer data, request payloads, proxy
configuration, or secret-file contents belong in this ledger.

## Delivered dependency evidence

| Dependency | Integrated evidence | Static source/doc paths inspected | Static result | Runtime status | Residual risk |
|---|---|---|---|---|---|
| 5.1.1 storefront settings | `1f85239823f42f77faa7e751a98ff02750ec7d37`; `pop/memory/5.1.1-storefront-settings-and-customization.md` | `src/auth/storefront-settings.ts`, `src/app/storefront/`, `pop/specs/storefront-and-customization.md` | Owner configuration and redacted-public boundary documented as delivered dependency scope. | **SKIPPED — user directed** | No live owner configuration flow exercised. |
| 5.2.1 public storefront | `c3ef63458503a3ec40925f2a8a4436ffb3801187`; `pop/memory/5.2.1-public-storefront-page.md` | `src/storefront/`, `src/app/store/`, `pop/specs/storefront-and-customization.md` | Sessionless public storefront remains a redacted dependency surface. | **SKIPPED — user directed** | No browser/public-page check performed. |
| 5.3.1 headers and origin checks | `d707055`; `pop/memory/5.3.1-security-headers-and-origin-checks.md` | `next.config.ts`, `src/app/origin-guard.ts`, `AGENTS.md` | Proxy must supply canonical public host; static headers/origin guard are present in source. | **SKIPPED — user directed** | No live header, TLS, or cross-origin request exercise. |
| 5.3.2 public rate limiting | `15a7e4f08541fe8c5529102bb130a7d4354f3665`; `pop/memory/5.3.2-public-endpoint-rate-limiting.md` | `src/security/public-rate-limit.ts`, public payment-link handlers, `AGENTS.md` | Limiter is bounded, single-process, and consumes only a canonical proxy-overwritten IP or anonymous fallback. | **SKIPPED — user directed** | No load, proxy-header, or multi-process behavior exercise. |
| 5.4.1 structured logging | `1981526056b8f92571200c378cd2b400fd825a02`; `pop/memory/5.4.1-structured-server-logging.md` | `src/observability/server-request-log.ts`, eligible handlers, `AGENTS.md` | Completion records use a closed redacted schema and health remains unwrapped. | **SKIPPED — user directed** | No live log/redaction or request-id exercise. |

## Operations source-to-document audit

| Boundary | Sources inspected | Static result | Runtime status | Residual risk |
|---|---|---|---|---|
| Topology and TLS proxy | `compose.yaml`, `README.md`, `src/app/origin-guard.ts`, `src/security/public-rate-limit.ts` | App is loopback-only; database/one-shots have no host ports; runbook requires replace-not-append forwarding headers. | **SKIPPED — user directed** | Public exposure and proxy trust boundary unverified. |
| Startup and health | `compose.yaml`, `container/bootstrap.mjs`, `container/migrate.mjs`, `container/identity-admin.mjs`, `container/runtime.mjs`, `container/healthcheck.mjs` | One-shot dependency chain and runtime `SELECT 1` preflight precede bind; health is liveness only. | **SKIPPED — user directed** | Startup ordering and liveness response unverified. |
| Configuration and secrets | `.env.compose.example`, `install/.env.example`, `container/prepare-identity-secrets.mjs`, `install/install.sh`, `AGENTS.md` | Distinct database credentials, protected file-backed staging, callback/API-base constraints, recovery posture, and encryption-key backup need are documented without values. | **SKIPPED — user directed** | Installer and secret handling unexercised. |
| Persistent media topology | `Dockerfile`, `compose.yaml`, `container/media-preflight.mjs`, `container/runtime.mjs` | Static contract fixes app-only `media-data:/app/media`, UID/GID 1000, read-only root, private controls, and pre-bind POSIX refusal. | **PASS — 2026-07-24 task 6.3.3** | Clean-clone `media` proved fresh copy-up identity, mount isolation, root-write refusal, restart persistence, and helper cleanup. |
| Install/update/uninstall lifecycle | `install/lib-operations.sh`, `install/install.sh`, `install/update.sh`, `install/uninstall.sh` | Static contract covers paired volume ownership, credential continuity, zero-row adoption, pinned previous-image rollback, sealed full update failure envelope, default retention, and exact-confirm paired purge. | **PASS — 2026-07-24 task 6.3.3** | Clean-clone `install-lifecycle` and `update` proved exact-SHA install images, role continuity, retained reinstall, adoption, paired purge, exact identities/media bytes, candidate-preflight/helper failure evidence, target recreate/health rollback, and old-app health. |
| Backup and restore | `install/backup.sh`, `install/restore.sh`, `install/pair-manifest.mjs`, `container/media-inventory.mjs` | Static contract covers atomic pair capture, dual exact-image binding, exact volume identities, closed no-follow manifest, private archive identity/modes, host-UID-independent secret staging, isolated rehearsal inventory, same-volume restore, and automatic recovery retention. | **PASS — 2026-07-24 task 6.3.3** | Clean-clone `media-backup` and `media-restore` proved normal install-to-backup binding, incompatible external DB-ops isolation, UID-2001 simulation, manifest/archive adversaries, exact teardown, automatic recovery, and double-failure migrate/metadata proof before restart. |
| Release documentation navigation | `README.md`, `docs/production-runbook.md`, this ledger | README links resolve to the authoritative runbook and ledger. | Not applicable; static link inspection only. | Operator must still complete the skipped operational gate. |

## Explicit skip register

This register belongs to the immutable Epoch 5 documentation candidate named
above. A later dated task result overrides a skip only for the exact row and
scope it names; it does not retroactively certify the candidate or a live
deployment.

| Check or exercise | Status |
|---|---|
| `pnpm lint` and `pnpm typecheck` | **SKIPPED — user directed** |
| `pnpm test` | **SKIPPED — user directed** |
| `pnpm build` | **SKIPPED — user directed** |
| `pnpm check` | **SKIPPED — user directed** |
| `pnpm db:generate`, `pnpm db:test`, and `pnpm db:contract-check` | **SKIPPED — user directed** |
| `pnpm container:contract-check -- --local-pins` | **PASS — 2026-07-24 task 6.3.3** |
| Every `pnpm container:test --clean-clone --scenario` exercise (`build`, `config`, `happy`, `roles`, `failures`, `lifecycle`, `isolation`) | **SKIPPED — user directed** |
| `pnpm container:test --clean-clone --scenario media` | **PASS — 2026-07-24 task 6.3.3** |
| `pnpm container:test --clean-clone --scenario install-lifecycle` | **PASS — 2026-07-24 task 6.3.3** |
| `pnpm container:test --clean-clone --scenario update` with media continuity and rollback assertions | **PASS — 2026-07-24 task 6.3.3** |
| `pnpm container:test --clean-clone --scenario media-backup` | **PASS — 2026-07-24 task 6.3.3** |
| `pnpm container:test --clean-clone --scenario media-restore` | **PASS — 2026-07-24 task 6.3.3** |
| `install/test.sh` | **PASS — 2026-07-24 task 6.3.3** |
| Initial-admin recovery outside the disposable task scenarios | **SKIPPED — user directed** |
| Compose operations outside the five dated task 6.3.3 scenarios above | **SKIPPED — user directed** |
| Browser, locale, storefront, checkout, and authenticated mutation exercises | **SKIPPED — user directed** |
| TLS proxy reachability, forwarding-header trust, and public network exposure checks | **SKIPPED — user directed** |
| Backup creation, restore rehearsal, upgrade rehearsal, rollback rehearsal, and data-recovery verification | **SKIPPED — user directed** |
| Live `GET /api/health` and runtime preflight verification | **SKIPPED — user directed** |

## Static audit limits and handoff

The original release audit inspected source and documentation only. Task 6.3.3
later added the dated disposable Docker evidence recorded above for persistent
media, retained install/update, atomic backup, and exact-release restore. It
does not prove Nautt reachability, proxy header replacement, or safe public
exposure.

Before a human merges or operates this release, carry out the skipped checks in
an approved environment and append their real dated results to the release
record. A failure in proxy header replacement, secret recovery, migration
compatibility, or restore targeting is a stop condition, not a documentation
exception.

## Status as of 2026-09-23

This section classifies every row above as stale or still valid against the
`develop` tree after the 2026-09-22 migration-baseline rebase (task 15.1.2)
and Epoch 15's V1 removal. It adds no new PASS or verified status; no prior
row or cell is edited. A dated live rehearsal replacing the skips above is
task 13.3.3's deliverable, not performed here.

### Delivered dependency evidence

| Dependency | Classification | Reason |
|---|---|---|
| 5.1.1 storefront settings | Stale | Storefront settings and the storefront surface were substantially rebuilt in Epoch 9/14 (Commerce V2, standalone payments); the inspected paths no longer reflect current behavior. |
| 5.2.1 public storefront | Stale | The public storefront was rebuilt on Commerce V2 (Epoch 9) and V1 removal (Epoch 15); the audited surface predates both. |
| 5.3.1 headers and origin checks | Still valid | The static header/origin-guard contract audited here is unchanged by the V1 removal or the migration rebase. |
| 5.3.2 public rate limiting | Still valid | The process-local limiter contract audited here is unchanged; still an accepted caveat (see the runbook's operating boundary). |
| 5.4.1 structured logging | Still valid | The console-sink structured-logging contract audited here is unchanged. |

### Operations source-to-document audit

| Boundary | Classification | Reason |
|---|---|---|
| Topology and TLS proxy | Still valid | Compose topology, loopback binding, and forwarding-header contract are unchanged. |
| Startup and health | Still valid | The one-shot startup chain and application-only liveness contract are unchanged. |
| Configuration and secrets | Still valid | Secret staging, credential separation, and the encryption-key posture are unchanged. |
| Persistent media topology | Still valid | The media mount/UID/GID contract proved on 2026-07-24 is unchanged by the migration rebase or V1 removal. |
| Install/update/uninstall lifecycle | Still valid | The install/update/uninstall contract proved on 2026-07-24 is unchanged; `install/update.sh` still runs the current `migration-policy.mjs` against whatever baseline is checked out. |
| Backup and restore | Still valid | The backup/restore pair contract proved on 2026-07-24 is unchanged. |
| Release documentation navigation | Stale | The README/runbook link targets are still correct, but the linked runbook and this ledger themselves changed on 2026-09-23 (task 13.3.1); re-verify navigation against the synced documents. |

### Explicit skip register

| Check or exercise | Classification | Reason |
|---|---|---|
| `pnpm lint` and `pnpm typecheck` | Stale | Both must be re-run against the current tree; the codebase changed substantially since 2026-07-21. |
| `pnpm test` | Stale | The test suite changed substantially (Epochs 6–15); a 2026-07-21 skip carries no signal about the current tree. |
| `pnpm build` | Stale | Must be re-run against the current tree. |
| `pnpm check` | Stale | Must be re-run against the current tree. |
| `pnpm db:generate`, `pnpm db:test`, and `pnpm db:contract-check` | Stale | The migration baseline was rebased on 2026-09-22 (task 15.1.2); these Docker-dependent, user-exclusive checks must be re-run against the 16-migration baseline. |
| `pnpm container:contract-check -- --local-pins` | Still valid | Proved 2026-07-24 (task 6.3.3) against contracts unchanged by the rebase; a fresh run is still task 13.3.3's dated rehearsal, not required to keep this row valid. |
| Every `pnpm container:test --clean-clone --scenario` exercise (`build`, `config`, `happy`, `roles`, `failures`, `lifecycle`, `isolation`) | Stale | Never exercised; still Docker-dependent and user-exclusive, unchanged skip. |
| `pnpm container:test --clean-clone --scenario media` | Still valid | Proved 2026-07-24 (task 6.3.3); media contract unchanged by the rebase or V1 removal. |
| `pnpm container:test --clean-clone --scenario install-lifecycle` | Still valid | Proved 2026-07-24 (task 6.3.3); install/update contract unchanged. |
| `pnpm container:test --clean-clone --scenario update` with media continuity and rollback assertions | Stale | The update path now runs `migration-policy.mjs` against the rebased 16-migration baseline; the 2026-07-21 exercise ran against the pre-rebase (19-directory) baseline and must be re-proven. |
| `pnpm container:test --clean-clone --scenario media-backup` | Still valid | Proved 2026-07-24 (task 6.3.3); backup contract unchanged. |
| `pnpm container:test --clean-clone --scenario media-restore` | Stale | Restore replays migration history against the target baseline; must be re-proven against the rebased 16-migration baseline. |
| `install/test.sh` | Stale | Exercises the full install/migration path; must be re-proven against the rebased baseline. |
| Initial-admin recovery outside the disposable task scenarios | Stale | Never exercised; still a standing gap, part of task 13.3.3's dated rehearsal scope. |
| Compose operations outside the five dated task 6.3.3 scenarios above | Stale | Never exercised; unchanged standing gap. |
| Browser, locale, storefront, checkout, and authenticated mutation exercises | Stale | The storefront, checkout, and order surfaces changed substantially (Epochs 9–15); the 2026-07-21 skip predates all of it. |
| TLS proxy reachability, forwarding-header trust, and public network exposure checks | Stale | Never exercised; unchanged standing gap. |
| Backup creation, restore rehearsal, upgrade rehearsal, rollback rehearsal, and data-recovery verification | Stale | The migration-rebase changes what "restore"/"upgrade" replay against; a dated rehearsal is task 13.3.3's deliverable. |
| Live `GET /api/health` and runtime preflight verification | Stale | Never exercised; unchanged standing gap. |
