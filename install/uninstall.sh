#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd "$INSTALL_DIR/.." && pwd)
ENV_FILE="$INSTALL_DIR/.env"
DRY_RUN=false
PURGE_DATA=false
PURGE_CONFIRMATION=
PROJECT=${CONTAINER_TEST_PROJECT:-qr-pagamentos}

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
print_command() { printf 'DRY-RUN'; printf ' %q' "$@"; printf '\n'; }
run() { if "$DRY_RUN"; then print_command "$@"; else "$@"; fi; }

# shellcheck source=install/lib-operations.sh
source "$INSTALL_DIR/lib-operations.sh"

while (($#)); do
  case "$1" in
    --env-file) (($# >= 2)) || die '--env-file requires a path'; ENV_FILE=$2; shift 2 ;;
    --purge-data) (($# >= 2)) || die '--purge-data requires the exact Compose project'; PURGE_DATA=true; PURGE_CONFIRMATION=$2; shift 2 ;;
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
    APP_PORT|POSTGRES_ADMIN_PASSWORD|MIGRATOR_PASSWORD|RUNTIME_PASSWORD|INITIAL_ADMIN_USERNAME|INITIAL_ADMIN_EMAIL|NAUTT_ENCRYPTION_KEY|NAUTT_WEBHOOK_CALLBACK_URL|NAUTT_API_BASE_URL|SMTP_HOST|SMTP_PORT|SMTP_USER|SMTP_PASSWORD|SMTP_FROM|SMTP_TLS_MODE|PUBLIC_ORIGIN) printf -v "$key" '%s' "$value" ;;
    *) die "unsupported variable in $ENV_FILE: $key" ;;
  esac
done < "$ENV_FILE"
for key in APP_PORT POSTGRES_ADMIN_PASSWORD MIGRATOR_PASSWORD RUNTIME_PASSWORD; do
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
if "$PURGE_DATA"; then
  [[ $PURGE_CONFIRMATION == "$PROJECT" ]] || die 'purge confirmation does not match the exact Compose project'
fi
if ! "$DRY_RUN"; then
  operation_lock "$ROOT_DIR"
  if "$PURGE_DATA"; then
    volume_contract "$PROJECT" postgres-data "${PROJECT}_postgres-data" || die 'PostgreSQL purge target is missing or foreign'
    volume_contract "$PROJECT" media-data "${PROJECT}_media-data" || die 'media purge target is missing or foreign'
  fi
fi

compose=("${DOCKER[@]}" compose -f "$ROOT_DIR/compose.yaml" -p "$PROJECT")
compose_env=(APP_PORT="$APP_PORT" POSTGRES_ADMIN_PASSWORD_FILE="$POSTGRES_ADMIN_PASSWORD_FILE" MIGRATOR_PASSWORD_FILE="$MIGRATOR_PASSWORD_FILE" RUNTIME_PASSWORD_FILE="$RUNTIME_PASSWORD_FILE" NAUTT_WEBHOOK_CALLBACK_URL="${NAUTT_WEBHOOK_CALLBACK_URL:-https://invalid.example}" STAGED_SECRETS_DIR="$STAGED_SECRETS_DIR")
down_args=(down --remove-orphans)
if "$DRY_RUN"; then
  "$PURGE_DATA" && printf 'DRY-RUN validate exact local Compose volumes %s_{postgres-data,media-data}\n' "$PROJECT"
  print_command env "${compose_env[@]}" "${compose[@]}" "${down_args[@]}"
else
  env "${compose_env[@]}" "${compose[@]}" "${down_args[@]}"
fi
if "$PURGE_DATA"; then
  run "${DOCKER[@]}" volume rm "${PROJECT}_postgres-data" "${PROJECT}_media-data"
  run rm -rf -- "$STAGED_SECRETS_DIR"
  run rm -rf -- "$SOURCE_SECRETS_DIR"
  printf 'PASS uninstall-purged-pair\n'
else
  printf 'PASS uninstall-retained-pair\n'
fi

printf 'PASS uninstall-complete\n'
