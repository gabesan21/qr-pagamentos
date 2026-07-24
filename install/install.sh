#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd "$INSTALL_DIR/.." && pwd)
ENV_FILE="$INSTALL_DIR/.env"
DRY_RUN=false
RECOVER_INITIAL_ADMIN=false
NODE_HELPER='node:26.4.0-bookworm-slim@sha256:ec82d089a8ae2cf02628da7b34ea57dc357b24db724d557fe2d240e6beb659c1'
POSTGRES_IMAGE='postgres:18.4-bookworm@sha256:1961f96e6029a02c3812d7cb329a3b03a3ac2bb067058dec17b0f5596aca9296'
POSTGRES_PORT=5433
PROJECT=${CONTAINER_TEST_PROJECT:-qr-pagamentos}
DOCKER=(docker)
RELEASE_REVISION=
APP_IMAGE=
DB_OPS_IMAGE=

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
print_command() { printf 'DRY-RUN'; printf ' %q' "$@"; printf '\n'; }
run() { if "$DRY_RUN"; then print_command "$@"; else "$@"; fi; }

# shellcheck source=install/lib-operations.sh
source "$INSTALL_DIR/lib-operations.sh"

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
      APP_PORT|POSTGRES_ADMIN_PASSWORD|MIGRATOR_PASSWORD|RUNTIME_PASSWORD|INITIAL_ADMIN_USERNAME|INITIAL_ADMIN_EMAIL|NAUTT_ENCRYPTION_KEY|NAUTT_WEBHOOK_CALLBACK_URL|NAUTT_API_BASE_URL)
        printf -v "$key" '%s' "$value" ;;
      *) die "unsupported variable in $ENV_FILE: $key" ;;
    esac
  done < "$ENV_FILE"
  for key in APP_PORT POSTGRES_ADMIN_PASSWORD MIGRATOR_PASSWORD RUNTIME_PASSWORD INITIAL_ADMIN_USERNAME NAUTT_WEBHOOK_CALLBACK_URL; do
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

run_node_helper() {
  if command -v node >/dev/null 2>&1; then
    node "$@"
  else
    "${DOCKER[@]}" run --rm --network none --read-only --tmpfs /tmp \
      --user "$(id -u):$(id -g)" -v "$ROOT_DIR:/workspace:ro" \
      "$NODE_HELPER" node "$@"
  fi
}

write_nautt_encryption_key_source() {
  local source_dir=$ROOT_DIR/.install-secrets
  run mkdir -p -m 0700 "$source_dir"
  if [[ -n ${NAUTT_ENCRYPTION_KEY:-} ]]; then
    if "$DRY_RUN"; then
      printf 'DRY-RUN validate and stage provided nautt_encryption_key\n'
    else
      if ! run_node_helper -e 'const b = Buffer.from(process.argv[1], "base64url"); process.exit(b.length === 32 ? 0 : 1)' "$NAUTT_ENCRYPTION_KEY" >/dev/null; then
        die 'NAUTT_ENCRYPTION_KEY must decode to exactly 32 bytes using base64url'
      fi
      (umask 077; printf '%s' "$NAUTT_ENCRYPTION_KEY" > "$source_dir/nautt_encryption_key")
      chmod 0600 "$source_dir/nautt_encryption_key"
    fi
  else
    if "$DRY_RUN"; then
      printf 'DRY-RUN generate nautt_encryption_key and warn operator to back it up\n'
    else
      (umask 077; run_node_helper -e 'const crypto = require("node:crypto"); process.stdout.write(crypto.randomBytes(32).toString("base64url"))' > "$source_dir/nautt_encryption_key")
      chmod 0600 "$source_dir/nautt_encryption_key"
      printf 'WARN: a new NAUTT_ENCRYPTION_KEY was generated; back up %s/nautt_encryption_key outside this host. Losing it makes every stored Nautt API key irrecoverable.\n' "$source_dir" >&2
    fi
  fi
  NAUTT_ENCRYPTION_KEY_FILE=$source_dir/nautt_encryption_key
}

stage_secrets() {
  local staged=$ROOT_DIR/.container-secrets variable source target actual
  run mkdir -p -m 0700 "$staged"
  for entry in \
    "POSTGRES_ADMIN_PASSWORD_FILE:admin_password" \
    "MIGRATOR_PASSWORD_FILE:migrator_password" \
    "RUNTIME_PASSWORD_FILE:runtime_password" \
    "NAUTT_ENCRYPTION_KEY_FILE:nautt_encryption_key" \
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
  APP_PORT=$APP_PORT POSTGRES_PORT=$POSTGRES_PORT POSTGRES_ADMIN_PASSWORD_FILE=$POSTGRES_ADMIN_PASSWORD_FILE \
    MIGRATOR_PASSWORD_FILE=$MIGRATOR_PASSWORD_FILE RUNTIME_PASSWORD_FILE=$RUNTIME_PASSWORD_FILE \
    NAUTT_WEBHOOK_CALLBACK_URL=$NAUTT_WEBHOOK_CALLBACK_URL \
    NAUTT_API_BASE_URL=${NAUTT_API_BASE_URL:-} \
    RELEASE_REVISION=$RELEASE_REVISION APP_IMAGE=$APP_IMAGE DB_OPS_IMAGE=$DB_OPS_IMAGE \
    STAGED_SECRETS_DIR=$STAGED_SECRETS_DIR INITIAL_ADMIN_RECOVERY_PASSWORD_FILE=${INITIAL_ADMIN_RECOVERY_PASSWORD_FILE:-} \
    "${DOCKER[@]}" compose -f "$ROOT_DIR/compose.yaml" -p "$PROJECT" "$@"
}

resolve_release_identity() {
  if "$DRY_RUN"; then
    RELEASE_REVISION=0000000000000000000000000000000000000000
  else
    command -v git >/dev/null 2>&1 || die 'the release checkout cannot resolve its immutable revision'
    [[ -z $(git -C "$ROOT_DIR" status --porcelain --untracked-files=all) ]] \
      || die 'installation requires a clean exact-release checkout'
    RELEASE_REVISION=$(git -C "$ROOT_DIR" rev-parse --verify 'HEAD^{commit}') \
      || die 'installation checkout has no exact release commit'
    [[ $RELEASE_REVISION =~ ^[0-9a-f]{40}$ ]] || die 'installation release revision is invalid'
  fi
  APP_IMAGE="${PROJECT}-app:$RELEASE_REVISION"
  DB_OPS_IMAGE="${PROJECT}-db-ops:$RELEASE_REVISION"
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
    print_command env RELEASE_REVISION="$RELEASE_REVISION" APP_IMAGE="$APP_IMAGE" DB_OPS_IMAGE="$DB_OPS_IMAGE" \
      docker compose -f "$ROOT_DIR/compose.yaml" -p "$PROJECT" build --pull bootstrap app
    print_command env RELEASE_REVISION="$RELEASE_REVISION" APP_IMAGE="$APP_IMAGE" DB_OPS_IMAGE="$DB_OPS_IMAGE" \
      docker compose -f "$ROOT_DIR/compose.yaml" -p "$PROJECT" up -d
    print_command env RELEASE_REVISION="$RELEASE_REVISION" APP_IMAGE="$APP_IMAGE" DB_OPS_IMAGE="$DB_OPS_IMAGE" \
      docker compose -f "$ROOT_DIR/compose.yaml" -p "$PROJECT" exec -T app node container/healthcheck.mjs
    printf 'DRY-RUN wait for exact http://127.0.0.1:%s/api/health = {"status":"ok"}\n' "$APP_PORT"
    return
  fi
  compose build --pull bootstrap app
  [[ $(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$APP_IMAGE") == "$RELEASE_REVISION" ]] \
    || die 'installed application image revision mismatch'
  [[ $(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$DB_OPS_IMAGE") == "$RELEASE_REVISION" ]] \
    || die 'installed database-operations image revision mismatch'
  compose up -d
  local attempt
  for attempt in {1..120}; do
    if compose exec -T app node container/healthcheck.mjs >/dev/null 2>&1; then
      compose exec -T app node container/media-preflight.mjs >/dev/null 2>&1 \
        || die 'installed media volume failed its local POSIX preflight'
      printf 'PASS install-health\n'
      printf 'PASS install-media-preflight\n'
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
resolve_release_identity
if ! "$DRY_RUN"; then operation_lock "$ROOT_DIR"; fi
if ! run_node_helper -e 'const u = new URL(process.argv[1]); process.exit(u.protocol === "https:" && !u.username && !u.password && !u.hash ? 0 : 1)' "$NAUTT_WEBHOOK_CALLBACK_URL" >/dev/null 2>&1; then
  die 'NAUTT_WEBHOOK_CALLBACK_URL must be an absolute HTTPS URL without credentials or a fragment'
fi
if [[ -n ${NAUTT_API_BASE_URL:-} ]]; then
  if ! run_node_helper -e 'const u = new URL(process.argv[1]); process.exit(u.protocol === "https:" && !u.username && !u.password && !u.hash ? 0 : 1)' "$NAUTT_API_BASE_URL" >/dev/null 2>&1; then
    die 'NAUTT_API_BASE_URL must be an absolute HTTPS URL without credentials or a fragment'
  fi
fi
[[ $POSTGRES_ADMIN_PASSWORD != "$MIGRATOR_PASSWORD" && $POSTGRES_ADMIN_PASSWORD != "$RUNTIME_PASSWORD" && $MIGRATOR_PASSWORD != "$RUNTIME_PASSWORD" ]] || die 'passwords must be distinct'
retained=false
if ! "$DRY_RUN" && docker volume inspect "${PROJECT}_postgres-data" >/dev/null 2>&1; then
  retained=true
  volume_contract "$PROJECT" postgres-data "${PROJECT}_postgres-data" || die 'PostgreSQL volume ownership is incompatible'
  validate_retained_credentials "$ROOT_DIR"
  POSTGRES_ADMIN_PASSWORD_FILE=$ROOT_DIR/.install-secrets/postgres_admin_password
  MIGRATOR_PASSWORD_FILE=$ROOT_DIR/.install-secrets/migrator_password
  RUNTIME_PASSWORD_FILE=$ROOT_DIR/.install-secrets/runtime_password
  NAUTT_ENCRYPTION_KEY_FILE=$ROOT_DIR/.install-secrets/nautt_encryption_key
  INITIAL_ADMIN_USERNAME_FILE=$ROOT_DIR/.install-secrets/initial_admin_username
  INITIAL_ADMIN_EMAIL_FILE=$ROOT_DIR/.install-secrets/initial_admin_email
  INITIAL_ADMIN_PASSWORD_FILE=$ROOT_DIR/.install-secrets/initial_admin_password
  STAGED_SECRETS_DIR=$ROOT_DIR/.container-secrets
  # Default uninstall removes the private network and database container. Recreate
  # only that retained-data boundary before no-output role authentication.
  compose up -d db
  validate_retained_database_roles "$ROOT_DIR" "$PROJECT" "$POSTGRES_IMAGE"
  ensure_media_volume "$ROOT_DIR" "$PROJECT" "$POSTGRES_IMAGE"
  printf 'PASS retained-credential-continuity\n'
else
  write_secret_sources
  write_nautt_encryption_key_source
  write_identity_sources
  "$RECOVER_INITIAL_ADMIN" && write_recovery_source
  stage_secrets
fi
if "$RECOVER_INITIAL_ADMIN" && "$retained"; then
  write_recovery_source
  INITIAL_ADMIN_RECOVERY_PASSWORD_FILE=$ROOT_DIR/.install-secrets/initial_admin_recovery_password
  "${DOCKER[@]}" run --rm --network none --read-only --tmpfs /tmp \
    -v "$INITIAL_ADMIN_RECOVERY_PASSWORD_FILE:/source:ro" -v "$STAGED_SECRETS_DIR:/staged" "$NODE_HELPER" \
    sh -eu -c 'umask 077; cp /source /staged/initial_admin_recovery_password; chown 1000:1000 /staged/initial_admin_recovery_password; chmod 0400 /staged/initial_admin_recovery_password'
fi
if "$RECOVER_INITIAL_ADMIN"; then
  recover_initial_admin
else
  deploy
  printf 'PASS install-complete initial-admin-password-file=%s/.install-secrets/initial_admin_password\n' "$ROOT_DIR"
fi
