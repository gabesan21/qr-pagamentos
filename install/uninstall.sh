#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd "$INSTALL_DIR/.." && pwd)
ENV_FILE="$INSTALL_DIR/.env"
DRY_RUN=false
PURGE_DATA=false

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
print_command() { printf 'DRY-RUN'; printf ' %q' "$@"; printf '\n'; }
run() { if "$DRY_RUN"; then print_command "$@"; else "$@"; fi; }

while (($#)); do
  case "$1" in
    --env-file) (($# >= 2)) || die '--env-file requires a path'; ENV_FILE=$2; shift 2 ;;
    --purge-data) PURGE_DATA=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done

strip_quotes() {
  local value=$1
  if [[ $value == \"*\" && $value == *\" ]] || [[ $value == \'*\' && $value == *\' ]]; then
    value=${value:1:${#value}-2}
  fi
  printf '%s' "$value"
}

[[ -f $ENV_FILE ]] || die "missing installer environment file: $ENV_FILE"
while IFS= read -r line || [[ -n $line ]]; do
  line=${line%$'\r'}
  [[ -z $line || $line == \#* ]] && continue
  [[ $line == *=* ]] || die "invalid line in $ENV_FILE"
  key=${line%%=*}; value=$(strip_quotes "${line#*=}")
  case "$key" in
    APP_PORT|POSTGRES_ADMIN_PASSWORD|MIGRATOR_PASSWORD|RUNTIME_PASSWORD|INITIAL_ADMIN_USERNAME|INITIAL_ADMIN_EMAIL) printf -v "$key" '%s' "$value" ;;
    *) die "unsupported variable in $ENV_FILE: $key" ;;
  esac
done < "$ENV_FILE"
for key in APP_PORT POSTGRES_ADMIN_PASSWORD MIGRATOR_PASSWORD RUNTIME_PASSWORD INITIAL_ADMIN_USERNAME; do
  [[ -n ${!key:-} ]] || die "required variable is missing: $key"
done
[[ $APP_PORT =~ ^[1-9][0-9]{0,4}$ ]] && ((10#$APP_PORT <= 65535)) || die 'APP_PORT must be between 1 and 65535'
STAGED_SECRETS_DIR=$ROOT_DIR/.container-secrets
SOURCE_SECRETS_DIR=$ROOT_DIR/.install-secrets
POSTGRES_ADMIN_PASSWORD_FILE=$SOURCE_SECRETS_DIR/postgres_admin_password
MIGRATOR_PASSWORD_FILE=$SOURCE_SECRETS_DIR/migrator_password
RUNTIME_PASSWORD_FILE=$SOURCE_SECRETS_DIR/runtime_password

if ! "$DRY_RUN"; then
  docker info >/dev/null 2>&1 \
    || die 'the current user cannot access the Docker daemon; add it to the docker group (sudo usermod -aG docker "$USER", then log out and back in) and retry'
fi
DOCKER=(docker)

compose=("${DOCKER[@]}" compose -f "$ROOT_DIR/compose.yaml" -p qr-pagamentos)
compose_env=(APP_PORT="$APP_PORT" POSTGRES_ADMIN_PASSWORD_FILE="$POSTGRES_ADMIN_PASSWORD_FILE" MIGRATOR_PASSWORD_FILE="$MIGRATOR_PASSWORD_FILE" RUNTIME_PASSWORD_FILE="$RUNTIME_PASSWORD_FILE" STAGED_SECRETS_DIR="$STAGED_SECRETS_DIR")
down_args=(down --remove-orphans)
"$PURGE_DATA" && down_args+=(--volumes)
if "$DRY_RUN"; then
  print_command env "${compose_env[@]}" "${compose[@]}" "${down_args[@]}"
else
  env "${compose_env[@]}" "${compose[@]}" "${down_args[@]}"
fi
run rm -rf -- "$STAGED_SECRETS_DIR"
run rm -rf -- "$SOURCE_SECRETS_DIR"

printf 'PASS uninstall-complete\n'
