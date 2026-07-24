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
| Persistent media topology | `Dockerfile`, `compose.yaml`, `container/media-preflight.mjs`, `container/runtime.mjs` | Static contract fixes app-only `media-data:/app/media`, UID/GID 1000, read-only root, private controls, and pre-bind POSIX refusal. | **PENDING — task 6.3.3 runtime gate** | Fresh-volume copy-up, mount isolation, restart persistence, and live refusal remain unverified. |
| Install/update/uninstall lifecycle | `install/lib-operations.sh`, `install/install.sh`, `install/update.sh`, `install/uninstall.sh` | Static contract covers paired volume ownership, credential continuity, zero-row adoption, old-app boundary, image-only rollback, default retention, and exact-confirm paired purge. | **PENDING — task 6.3.3 runtime gate** | Role authentication, adoption, retained reinstall, update failure boundaries, and rollback remain unverified. |
| Backup and restore | `install/backup.sh`, `install/restore.sh`, `install/pair-manifest.mjs`, `container/media-inventory.mjs` | Static contract covers atomic pair capture, closed manifest, isolated rehearsal inventory, same-volume restore, and automatic recovery retention. No runtime PASS is claimed. | **PENDING — task 6.3.3 runtime gate** | Backup integrity, rehearsal isolation/cleanup, managed restore, automatic recovery, and double-failure behavior remain unverified. |
| Release documentation navigation | `README.md`, `docs/production-runbook.md`, this ledger | README links resolve to the authoritative runbook and ledger. | Not applicable; static link inspection only. | Operator must still complete the skipped operational gate. |

## Explicit skip register

The following work was not run for this candidate. Every entry is
**SKIPPED — user directed**, and none may be inferred to have passed.

| Check or exercise | Status |
|---|---|
| `pnpm lint` and `pnpm typecheck` | **SKIPPED — user directed** |
| `pnpm test` | **SKIPPED — user directed** |
| `pnpm build` | **SKIPPED — user directed** |
| `pnpm check` | **SKIPPED — user directed** |
| `pnpm db:generate`, `pnpm db:test`, and `pnpm db:contract-check` | **SKIPPED — user directed** |
| `pnpm container:contract-check` | **SKIPPED — user directed** |
| Every `pnpm container:test --clean-clone --scenario` exercise (`build`, `config`, `happy`, `roles`, `failures`, `lifecycle`, `isolation`) | **SKIPPED — user directed** |
| `pnpm container:test --clean-clone --scenario media` | **PENDING — task 6.3.3 runtime gate** |
| `pnpm container:test --clean-clone --scenario install-lifecycle` | **PENDING — task 6.3.3 runtime gate** |
| `pnpm container:test --clean-clone --scenario update` with media continuity and rollback assertions | **PENDING — task 6.3.3 runtime gate** |
| `pnpm container:test --clean-clone --scenario media-backup` | **PENDING — task 6.3.3 runtime gate** |
| `pnpm container:test --clean-clone --scenario media-restore` | **PENDING — task 6.3.3 runtime gate** |
| `install/test.sh`, installer execution, initial-admin recovery, and uninstall execution | **SKIPPED — user directed** |
| Compose build, startup, restart, service-log inspection, and container health checks | **SKIPPED — user directed** |
| Browser, locale, storefront, checkout, and authenticated mutation exercises | **SKIPPED — user directed** |
| TLS proxy reachability, forwarding-header trust, and public network exposure checks | **SKIPPED — user directed** |
| Backup creation, restore rehearsal, upgrade rehearsal, rollback rehearsal, and data-recovery verification | **SKIPPED — user directed** |
| Live `GET /api/health` and runtime preflight verification | **SKIPPED — user directed** |

## Static audit limits and handoff

This task inspected source and documentation only. It found the dependency
memories and commits listed above and recorded the committed topology and
operational contracts in the runbook. It does not prove that images build,
containers start, credentials work, Nautt is reachable, a proxy overwrites
headers, backups restore, or the application is safe to expose publicly.

Before a human merges or operates this release, carry out the skipped checks in
an approved environment and append their real dated results to the release
record. A failure in proxy header replacement, secret recovery, migration
compatibility, or restore targeting is a stop condition, not a documentation
exception.
