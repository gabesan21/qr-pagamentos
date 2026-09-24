# Release rehearsal protocol

This protocol replaces a static-review waiver with a dated, repeatable live
rehearsal. Every step below is `verify: user`: the agent never builds, runs,
or checks anything through Docker (`AGENTS.md`), so this document only
describes operator actions. No step invokes a new script or scenario; every
automated command below is verbatim from `package.json`, `install/*.sh`, or
the `allowed` scenario set in `pop/scripts/container-test.mjs:23`.

Record every run in the dated section of
[release evidence](release-evidence.md) using its fillable template. A
`FAIL` is a stop condition: do not continue to a later block, and do not
mark the release operational.

## Preconditions

- Docker Engine and the Docker Compose v2 plugin installed, with the invoking
  operator already a member of the `docker` group (`README.md` "Prerequisites").
- A clean git checkout on a branch with a reachable upstream, matching the
  candidate revision to rehearse.
- Node.js and pnpm pinned per `.node-version` / `package.json`, with
  `pnpm install --frozen-lockfile` already run for block A's `pnpm` commands.
- `docs/production-runbook.md` and the current `docs/release-evidence.md`
  already read.

## Block A — Disposable harness

Repeatable, clean-clone scenarios that destroy only their own uniquely
labelled disposable project (`README.md` "Test-only destructive cleanup").
Safe to run against any checkout, including a developer machine with Docker.

### A1 — Clean install and steady state

- **Owner:** user
- **Command:** `pnpm container:test --clean-clone --scenario happy`
  (`package.json` `container:test` script; scenario `happy` is in the
  `allowed` set, `pop/scripts/container-test.mjs:23`)
- **Expected:** exit code 0; console includes `PASS clean-build`,
  `PASS bootstrap`, `PASS migration`, `PASS identity-seed`,
  `PASS runtime-db-preflight`, `PASS app-liveness`, `PASS static-assets`.
- **Failure means:** the basic install/startup contract broke. Stop; do not
  run later steps until this passes.

### A2 — Install lifecycle (retention, continuity, adoption, purge)

- **Owner:** user
- **Command:** `pnpm container:test --clean-clone --scenario install-lifecycle`
- **Expected:** exit code 0; console includes `PASS install-lifecycle-retention`,
  `PASS install-lifecycle-credential-continuity`,
  `PASS install-lifecycle-zero-row-adoption`,
  `PASS install-lifecycle-paired-purge`.
- **Failure means:** default uninstall/reinstall no longer preserves
  credentials or volume identity, or purge no longer removes paired data.
  Stop and investigate before any real install/uninstall/purge.

### A3 — Update and rollback

- **Owner:** user
- **Command:** `pnpm container:test --clean-clone --scenario update`
- **Expected:** exit code 0; console includes `PASS update-install-baseline`,
  `PASS update-rerun`, `PASS update-volume-identity`,
  `PASS update-media-byte-retention`, `PASS update-nautt-key-continuity`,
  `PASS update-startup-gates`, `PASS update-pulled-pending-migration`,
  `PASS update-prisma-failure-retention`,
  `PASS update-bootstrap-failure-retention`,
  `PASS update-identity-seed-failure-retention`,
  `PASS update-target-health-image-rollback`,
  `PASS update-candidate-preflight-failure-retention`,
  `PASS update-target-recreate-failure-rollback`,
  `PASS update-failure-retains-app`, `PASS update-evidence-retention`.
- **Failure means:** the updater's rollback or evidence contract regressed
  (e.g. a failed migration or health check no longer restores the previous
  image). Stop; do not run `install/update.sh` against a real deployment.

### A4 — Backup

- **Owner:** user
- **Command:** `pnpm container:test --clean-clone --scenario media-backup`
- **Expected:** exit code 0; console includes `PASS media-backup-pair`.
- **Failure means:** the backup pair no longer binds the exact release/image
  identity or leaks a protected value into the manifest. Stop before taking
  a real backup.

### A5 — Restore

- **Owner:** user
- **Command:** `pnpm container:test --clean-clone --scenario media-restore`
- **Expected:** exit code 0; console includes `PASS media-restore-rehearsal`,
  `PASS media-restore-managed-pair`, `PASS media-restore-adversaries`,
  `PASS media-restore-automatic-recovery`, `PASS media-restore-double-failure`.
- **Failure means:** restore no longer rejects a tampered/incompatible backup,
  or the automatic-recovery/double-failure safety net regressed. Stop; do not
  run `install/restore.sh` against a real deployment.

### A6 — Initial-admin recovery

- **Owner:** user
- **Command:** `pnpm container:test --clean-clone --scenario identity-recovery`
- **Expected:** exit code 0; console includes
  `PASS installer-recovery-helper-paths`,
  `PASS installer-recovery-candidate-promotion`,
  `PASS installer-recovery-failure-retention`,
  `PASS identity-recovery-uuid-target`,
  `PASS identity-recovery-deleted-target-abort`.
- **Failure means:** `install/install.sh --recover-initial-admin` no longer
  targets the immutable initial-admin UUID, or a failed recovery no longer
  retains its retry candidate. Stop before relying on this recovery path
  operationally.

### A7 — End-to-end production rehearsal

- **Owner:** user
- **Command:** `pnpm container:test --clean-clone --scenario production-rehearsal`
- **Expected:** exit code 0; console includes
  `PASS production-rehearsal-install`,
  `PASS production-rehearsal-identity-seed`,
  `PASS production-rehearsal-health-after-install`,
  `PASS production-rehearsal-smtp-sink`,
  `PASS production-rehearsal-admin-password-reset`,
  `PASS production-rehearsal-commerce-fixtures`,
  `PASS production-rehearsal-media-persistence`,
  `PASS production-rehearsal-locale-theme-rendering`,
  `PASS production-rehearsal-update-noop`,
  `PASS production-rehearsal-backup-manifest`,
  `PASS production-rehearsal-restore`,
  `PASS production-rehearsal-post-restore-health`,
  `PASS production-rehearsal-exact-revision-ledger`.
- **Failure means:** the composed install → admin login → merchant
  password-reset-over-SMTP → media/catalog/checkout fixtures → no-op update →
  backup → restore chain broke somewhere. Stop; the specific `PASS` line
  missing identifies which segment regressed.

### A8 — Installer static contract

- **Owner:** user
- **Command:** `install/test.sh`
- **Expected:** exit code 0; no `FAIL install-contract` line.
- **Failure means:** the installer's dry-run output no longer matches its
  documented contract (secret redaction, non-root ownership, health check
  wording). Stop before using the installer on a real host.

## Block B — Target deployment

Run against the actual staging or production host that will serve traffic.
These steps mutate real, non-disposable state; they are never combined with
block A's `--clean-clone` labelling.

### B1 — Install (or confirm the current install)

- **Owner:** user
- **Command:** `install/install.sh --env-file <path-to-installer-env>`
  (flag verified at `install/install.sh:27`)
- **Expected:** exit code 0; output includes `PASS install-complete`.
- **Failure means:** do not proceed; correct the reported input (secret file,
  Docker access, port) and rerun before any later block-B step.

### B2 — Update to the candidate revision

- **Owner:** user
- **Command:** `install/update.sh`
  (no-argument normal use, `docs/production-runbook.md` "Upgrade and
  rollback"; `--env-file` verified at `install/update.sh:32`)
- **Expected:** exit code 0; output includes
  `PASS update-complete revision=<SHA> migrate=<container> app=<container>
  evidence=<file>` with `<SHA>` equal to the candidate revision.
- **Failure means:** the updater already rolled back to the previous image
  (per its documented contract). Retain both the reported evidence file and
  logs, and do not force a retry that bypasses the recorded failure.

### B3 — Backup

- **Owner:** user
- **Command:** `install/backup.sh --destination /srv/qr-pagamentos-backups`
  (`docs/production-runbook.md` "Backup and restore"; `--destination`
  verified at `install/backup.sh:18`)
- **Expected:** exit code 0; a new `qr-pair-<timestamp>` set published under
  the destination.
- **Failure means:** nothing is published on failure (atomic). Investigate
  before trusting any earlier set as current.

### B4 — Restore rehearsal against the just-created backup

- **Owner:** user
- **Command:** `install/restore.sh --backup <the-set-from-B3> --confirm RESTORE:qr-pagamentos`
  (`docs/production-runbook.md` "Backup and restore"; `--backup`/`--confirm`
  verified at `install/restore.sh:29-30`)
- **Expected:** exit code 0; output includes a `PASS media-restore` line.
- **Failure means:** restore attempted automatic recovery; confirm the
  application is healthy again before declaring this step done, and retain
  every artifact restore reports.

### B5 — Initial-admin recovery (only if the recorded initial administrator is locked out)

- **Owner:** user
- **Command:** `install/install.sh --recover-initial-admin --env-file <path-to-installer-env>`
  (flag verified at `install/install.sh:29`;
  `docs/production-runbook.md` "Configuration and secret posture")
- **Expected:** exit code 0; the recorded initial administrator's ADMIN role
  is reactivated with a rotated credential.
- **Failure means:** the recovery target (its immutable UUID) is missing or
  the operation aborted; do not attempt a username/email-based workaround.

## Block C — External reachability

Verifies only that the registered `NAUTT_WEBHOOK_CALLBACK_URL` answers from
the public internet. Local delivery simulation and signature forging are out
of scope (2026-09-23 decisions, "Out of scope": local webhook testing).

### C1 — Registered callback answers

- **Owner:** user
- **Command:** issue an unsigned HTTP request to the exact registered
  callback URL from outside the deployment network (any generic HTTP client,
  e.g. `curl -i -X POST <registered-callback-url>`; this is a standard
  external probe tool, not project tooling, so it carries no scenario/script
  citation).
- **Expected:** the public URL answers with `401` (unauthenticated rejection,
  per `pop/specs/nautt-finance-integration.md`'s webhook intake contract) —
  not a connection failure, timeout, or `5xx`.
- **Failure means:** the callback is unreachable from the public internet
  (proxy/DNS/TLS misconfiguration) or the route itself is broken; Nautt
  cannot deliver webhooks until this is fixed. This step never simulates a
  local delivery or forges an HMAC signature — that is explicitly out of
  scope for this protocol.

## Coverage checklist

Clean install (A1/B1) · update (A3/B2) · rollback (A3, on injected failure)
· backup (A4/B3) · restore (A5/B4) · initial-admin recovery (A6/B5) ·
webhook callback reachability (C1).
