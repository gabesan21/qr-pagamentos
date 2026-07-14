#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd "$INSTALL_DIR/.." && pwd)
ENV_FILE="$INSTALL_DIR/.env"
DRY_RUN=false
RECOVER_INITIAL_ADMIN=false
NODE_HELPER='node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d'
DOCKER=(docker)

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
print_command() { printf 'DRY-RUN'; printf ' %q' "$@"; printf '\n'; }
run() { if "$DRY_RUN"; then print_command "$@"; else "$@"; fi; }

while (($#)); do
  case "$1" in
    --env-file) (($# >= 2)) || die '--env-file requires a path'; ENV_FILE=$2; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --recover-initial-admin) RECOVER_INITIAL_ADMIN=true; shift ;;
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

load_install_env() {
  [[ -f $ENV_FILE ]] || die "copy install/.env.example to install/.env first"
  if IFS= read -r -d '' _ < "$ENV_FILE"; then
    die "installer environment file contains a NUL byte"
  fi
  local line key value
  while IFS= read -r line || [[ -n $line ]]; do
    line=${line%$'\r'}
    [[ -z $line || $line == \#* ]] && continue
    [[ $line == *=* ]] || die "invalid line in $ENV_FILE"
    key=${line%%=*}
    value=$(strip_quotes "${line#*=}")
    case "$key" in
      APP_PORT|POSTGRES_ADMIN_PASSWORD|MIGRATOR_PASSWORD|RUNTIME_PASSWORD|INITIAL_ADMIN_USERNAME|INITIAL_ADMIN_EMAIL)
        printf -v "$key" '%s' "$value" ;;
      *) die "unsupported variable in $ENV_FILE: $key" ;;
    esac
  done < "$ENV_FILE"
  for key in APP_PORT POSTGRES_ADMIN_PASSWORD MIGRATOR_PASSWORD RUNTIME_PASSWORD INITIAL_ADMIN_USERNAME; do
    [[ -n ${!key:-} ]] || die "required variable is missing: $key"
  done
  [[ $APP_PORT =~ ^[1-9][0-9]{0,4}$ ]] && ((10#$APP_PORT <= 65535)) || die 'APP_PORT must be between 1 and 65535'
}

write_identity_sources() {
  local source_dir=$ROOT_DIR/.install-secrets
  if "$DRY_RUN"; then
    printf 'DRY-RUN create protected identity files %s/{initial_admin_username,initial_admin_email,initial_admin_password} mode 0600\n' "$source_dir"
  else
    printf '%s\n%s' "$INITIAL_ADMIN_USERNAME" "${INITIAL_ADMIN_EMAIL:-}" | "${DOCKER[@]}" run --rm -i --network none --read-only --tmpfs /tmp \
      --user "$(id -u):$(id -g)" -v "$ROOT_DIR:/workspace:ro" -v "$source_dir:/secrets" \
      "$NODE_HELPER" node /workspace/container/prepare-identity-secrets.mjs /secrets
  fi
  INITIAL_ADMIN_USERNAME_FILE=$source_dir/initial_admin_username
  INITIAL_ADMIN_EMAIL_FILE=$source_dir/initial_admin_email
  INITIAL_ADMIN_PASSWORD_FILE=$source_dir/initial_admin_password
}

write_recovery_source() {
  local source_dir=$ROOT_DIR/.install-secrets
  if "$DRY_RUN"; then
    printf 'DRY-RUN create/reuse protected recovery candidate %s/initial_admin_recovery_password mode 0600\n' "$source_dir"
  else
    "${DOCKER[@]}" run --rm --network none --read-only --tmpfs /tmp \
      --user "$(id -u):$(id -g)" -v "$ROOT_DIR:/workspace:ro" -v "$source_dir:/secrets" \
      "$NODE_HELPER" node /workspace/container/prepare-identity-secrets.mjs /secrets --recovery
  fi
  INITIAL_ADMIN_RECOVERY_PASSWORD_FILE=$source_dir/initial_admin_recovery_password
}

check_docker() {
  if "$DRY_RUN"; then
    print_command command -v docker
    print_command docker compose version
    print_command docker info
    return
  fi
  command -v docker >/dev/null 2>&1 \
    || die 'Docker Engine is a prerequisite this installer does not manage; install it first: https://docs.docker.com/engine/install/'
  docker compose version >/dev/null 2>&1 \
    || die 'the Docker Compose v2 plugin is a prerequisite this installer does not manage; install it first: https://docs.docker.com/compose/install/linux/'
  docker info >/dev/null 2>&1 \
    || die 'the current user cannot access the Docker daemon; add it to the docker group (sudo usermod -aG docker "$USER", then log out and back in) and retry'
}

write_secret_sources() {
  local source_dir=$ROOT_DIR/.install-secrets variable target
  run mkdir -p -m 0700 "$source_dir"
  for entry in \
    "POSTGRES_ADMIN_PASSWORD:postgres_admin_password" \
    "MIGRATOR_PASSWORD:migrator_password" \
    "RUNTIME_PASSWORD:runtime_password"; do
    variable=${entry%%:*}; target=${entry#*:}
    if "$DRY_RUN"; then
      printf 'DRY-RUN create protected secret %s/%s mode 0600\n' "$source_dir" "$target"
    else
      (umask 077; printf '%s' "${!variable}" > "$source_dir/$target")
      chmod 0600 "$source_dir/$target"
    fi
  done
  POSTGRES_ADMIN_PASSWORD_FILE=$source_dir/postgres_admin_password
  MIGRATOR_PASSWORD_FILE=$source_dir/migrator_password
  RUNTIME_PASSWORD_FILE=$source_dir/runtime_password
}

stage_secrets() {
  local staged=$ROOT_DIR/.container-secrets variable source target actual
  run mkdir -p -m 0700 "$staged"
  for entry in \
    "POSTGRES_ADMIN_PASSWORD_FILE:admin_password" \
    "MIGRATOR_PASSWORD_FILE:migrator_password" \
    "RUNTIME_PASSWORD_FILE:runtime_password" \
    "INITIAL_ADMIN_USERNAME_FILE:initial_admin_username" \
    "INITIAL_ADMIN_EMAIL_FILE:initial_admin_email" \
    "INITIAL_ADMIN_PASSWORD_FILE:initial_admin_password"; do
    variable=${entry%%:*}
    source=${!variable}
    target=${entry#*:}
    if "$DRY_RUN"; then
      print_command "${DOCKER[@]}" run --rm --network none --read-only --tmpfs /tmp -v "$source:/source:ro" -v "$staged:/staged" "$NODE_HELPER" sh -eu -c "umask 077; cp /source /staged/$target; chown 1000:1000 /staged/$target; chmod 0400 /staged/$target"
    else
      "${DOCKER[@]}" run --rm --network none --read-only --tmpfs /tmp -v "$source:/source:ro" -v "$staged:/staged" "$NODE_HELPER" sh -eu -c "umask 077; cp /source /staged/$target; chown 1000:1000 /staged/$target; chmod 0400 /staged/$target"
      actual=$(stat -c '%u:%g:%a' "$staged/$target")
      [[ $actual == 1000:1000:400 ]] || die "staged secret identity is invalid: $target"
    fi
  done
  if "$RECOVER_INITIAL_ADMIN"; then
    variable=INITIAL_ADMIN_RECOVERY_PASSWORD_FILE
    source=${!variable}
    target=initial_admin_recovery_password
    if "$DRY_RUN"; then
      print_command "${DOCKER[@]}" run --rm --network none --read-only --tmpfs /tmp -v "$source:/source:ro" -v "$staged:/staged" "$NODE_HELPER" sh -eu -c "umask 077; cp /source /staged/$target; chown 1000:1000 /staged/$target; chmod 0400 /staged/$target"
    else
      "${DOCKER[@]}" run --rm --network none --read-only --tmpfs /tmp -v "$source:/source:ro" -v "$staged:/staged" "$NODE_HELPER" sh -eu -c "umask 077; cp /source /staged/$target; chown 1000:1000 /staged/$target; chmod 0400 /staged/$target"
      actual=$(stat -c '%u:%g:%a' "$staged/$target")
      [[ $actual == 1000:1000:400 ]] || die "staged secret identity is invalid: $target"
    fi
  fi
  STAGED_SECRETS_DIR=$staged
}

compose() {
  APP_PORT=$APP_PORT POSTGRES_ADMIN_PASSWORD_FILE=$POSTGRES_ADMIN_PASSWORD_FILE \
    MIGRATOR_PASSWORD_FILE=$MIGRATOR_PASSWORD_FILE RUNTIME_PASSWORD_FILE=$RUNTIME_PASSWORD_FILE \
    STAGED_SECRETS_DIR=$STAGED_SECRETS_DIR INITIAL_ADMIN_RECOVERY_PASSWORD_FILE=${INITIAL_ADMIN_RECOVERY_PASSWORD_FILE:-} \
    "${DOCKER[@]}" compose -f "$ROOT_DIR/compose.yaml" -p qr-pagamentos "$@"
}

recover_initial_admin() {
  INITIAL_ADMIN_RECOVERY_PASSWORD_FILE=$ROOT_DIR/.container-secrets/initial_admin_recovery_password
  if "$DRY_RUN"; then
    print_command docker compose -f "$ROOT_DIR/compose.yaml" -p qr-pagamentos -f "$ROOT_DIR/compose.recovery.yaml" run --rm --no-deps identity-recovery
    printf 'DRY-RUN promote recovery candidate to %s/.install-secrets/initial_admin_password and remove staged candidate\n' "$ROOT_DIR"
  else
    compose -f "$ROOT_DIR/compose.recovery.yaml" run --rm --no-deps identity-recovery
    mv -f "$ROOT_DIR/.install-secrets/initial_admin_recovery_password" "$ROOT_DIR/.install-secrets/initial_admin_password"
    chmod 0600 "$ROOT_DIR/.install-secrets/initial_admin_password"
    rm -f "$ROOT_DIR/.container-secrets/initial_admin_recovery_password"
  fi
  printf 'PASS initial-admin-recovered password-file=%s/.install-secrets/initial_admin_password\n' "$ROOT_DIR"
}

deploy() {
  if "$DRY_RUN"; then
    print_command docker compose -f "$ROOT_DIR/compose.yaml" -p qr-pagamentos build --pull
    print_command docker compose -f "$ROOT_DIR/compose.yaml" -p qr-pagamentos up -d
    print_command docker compose -f "$ROOT_DIR/compose.yaml" -p qr-pagamentos exec -T app node container/healthcheck.mjs
    printf 'DRY-RUN wait for exact http://127.0.0.1:%s/api/health = {"status":"ok"}\n' "$APP_PORT"
    return
  fi
  compose build --pull
  compose up -d
  local attempt
  for attempt in {1..120}; do
    if compose exec -T app node container/healthcheck.mjs >/dev/null 2>&1; then
      printf 'PASS install-health\n'
      return
    fi
    sleep 1
  done
  compose ps >&2 || true
  compose logs --no-color app >&2 || true
  die 'application did not return the exact health response within 120 seconds'
}

check_docker
load_install_env
[[ $POSTGRES_ADMIN_PASSWORD != "$MIGRATOR_PASSWORD" && $POSTGRES_ADMIN_PASSWORD != "$RUNTIME_PASSWORD" && $MIGRATOR_PASSWORD != "$RUNTIME_PASSWORD" ]] || die 'passwords must be distinct'
write_secret_sources
write_identity_sources
"$RECOVER_INITIAL_ADMIN" && write_recovery_source
stage_secrets
if "$RECOVER_INITIAL_ADMIN"; then
  recover_initial_admin
else
  deploy
  printf 'PASS install-complete initial-admin-password-file=%s/.install-secrets/initial_admin_password\n' "$ROOT_DIR"
fi
