#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENV_FILE="$ROOT_DIR/install/.env.install"
DRY_RUN=false
PURGE_DATA=false
REMOVE_DOCKER=false
DOCKER_PACKAGES=(docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin)

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
print_command() { printf 'DRY-RUN'; printf ' %q' "$@"; printf '\n'; }
run() { if "$DRY_RUN"; then print_command "$@"; else "$@"; fi; }

while (($#)); do
  case "$1" in
    --env-file) (($# >= 2)) || die '--env-file requires a path'; ENV_FILE=$2; shift 2 ;;
    --purge-data) PURGE_DATA=true; shift ;;
    --remove-docker) REMOVE_DOCKER=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done

[[ -f $ENV_FILE ]] || die "missing installer environment file: $ENV_FILE"
while IFS= read -r line || [[ -n $line ]]; do
  line=${line%$'\r'}
  [[ -z $line || $line == \#* ]] && continue
  [[ $line == *=* ]] || die "invalid line in $ENV_FILE"
  key=${line%%=*}; value=${line#*=}
  case "$key" in
    APP_PORT|POSTGRES_ADMIN_PASSWORD_FILE|MIGRATOR_PASSWORD_FILE|RUNTIME_PASSWORD_FILE) printf -v "$key" '%s' "$value" ;;
    *) die "unsupported variable in $ENV_FILE: $key" ;;
  esac
done < "$ENV_FILE"
for key in APP_PORT POSTGRES_ADMIN_PASSWORD_FILE MIGRATOR_PASSWORD_FILE RUNTIME_PASSWORD_FILE; do
  [[ -n ${!key:-} ]] || die "required variable is missing: $key"
done
STAGED_SECRETS_DIR=$ROOT_DIR/.container-secrets

if ((EUID == 0)); then SUDO=(); elif "$DRY_RUN"; then SUDO=(sudo); else command -v sudo >/dev/null || die 'sudo is required'; SUDO=(sudo); fi
if "$DRY_RUN" || docker info >/dev/null 2>&1; then DOCKER=(docker); else DOCKER=("${SUDO[@]}" docker); fi

compose=("${DOCKER[@]}" compose -f "$ROOT_DIR/compose.yaml" -p qr-pagamentos)
compose_env=(APP_PORT="$APP_PORT" POSTGRES_ADMIN_PASSWORD_FILE="$POSTGRES_ADMIN_PASSWORD_FILE" MIGRATOR_PASSWORD_FILE="$MIGRATOR_PASSWORD_FILE" RUNTIME_PASSWORD_FILE="$RUNTIME_PASSWORD_FILE" STAGED_SECRETS_DIR="$STAGED_SECRETS_DIR")
down_args=(down --remove-orphans)
"$PURGE_DATA" && down_args+=(--volumes)
if "$DRY_RUN"; then
  print_command env "${compose_env[@]}" "${compose[@]}" "${down_args[@]}"
else
  env "${compose_env[@]}" "${compose[@]}" "${down_args[@]}"
fi
run "${SUDO[@]}" rm -rf -- "$STAGED_SECRETS_DIR"

if "$REMOVE_DOCKER"; then
  run "${SUDO[@]}" apt-get purge -y "${DOCKER_PACKAGES[@]}"
  run "${SUDO[@]}" apt-get autoremove -y
fi
printf 'PASS uninstall-complete\n'
