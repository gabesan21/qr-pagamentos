---
author: user
created: 2026-07-14
---

# Installer simplification - 2026-07-14

- **Docker is a prerequisite, not an installer responsibility:** `install/install.sh` no longer installs Docker Engine, Compose, or any OS package (previously Debian/Ubuntu-only via the official APT repository). It only checks `docker`, `docker compose version`, and `docker info`, and dies with a link to Docker's official install docs if any check fails. This removed all OS detection (`/etc/os-release`, `--os-release`).
- **No host privilege escalation:** the installer no longer uses `sudo`, `OPERATOR_UID`/`OPERATOR_GID`, or `chown` on any file it creates. Secret source/staging directories are created with plain `mkdir -p -m 0700` and written by the invoking user; if that user cannot reach the Docker daemon, the installer errors out and tells them to join the `docker` group (`sudo usermod -aG docker "$USER"`) themselves — it never does this for them.
- **Reasoning:** the prior design (apt-installing Docker, chowning secrets to a resolved operator UID via `sudo`) was overengineered for what should be a simple project-only setup script. Requiring Docker + Compose + docker-group membership as documented prerequisites removes an entire class of host-mutating code from the installer.
- **`.env` relocated:** the operator env file moved from repo-root `.env` to `install/.env`, to stop it being confused with the unrelated Next.js/Prisma `.env` at repo root. `install/uninstall.sh` lost `--remove-docker` (nothing is installed by the script anymore, so nothing needs package removal).
- **Applied directly, outside 004_processing:** these edits were made directly on `main` at the user's explicit instruction, not through task [[1.1.3-containerize-self-hosted-runtime]]'s worktree/branch. This superseded the installer contract that task's plan and Round 4 verification (`kanban/005_verifying/1.1.3-containerize-self-hosted-runtime/1.1.3-containerize-self-hosted-runtime.verify.md`) had assumed and passed. Criterion 9 needs re-verification against the current `install/install.sh`/`install/uninstall.sh` before the task can advance past `005_verifying`.
- **Branch reconciliation:** `develop` was fast-forwarded to match `main` so work continues from a single shared history instead of three diverging installer implementations (`main`, `develop`, and the task branch each had a different design at the time this decision was made).
