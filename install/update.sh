#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd "$INSTALL_DIR/.." && pwd)
ENV_FILE="$INSTALL_DIR/.env"
EVIDENCE_DIR="$ROOT_DIR/.update-evidence"
BACKUP_REFERENCE=
PREVIOUS_RELEASE=
DRY_RUN=false
PROJECT=qr-pagamentos
VOLUME_NAME=qr-pagamentos_postgres-data
POSTGRES_PORT=5433

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
print_command() { printf 'DRY-RUN'; printf ' %q' "$@"; printf '\n'; }

while (($#)); do
  case "$1" in
    --env-file) (($# >= 2)) || die '--env-file requires a path'; ENV_FILE=$2; shift 2 ;;
    --backup-reference) (($# >= 2)) || die '--backup-reference requires a value'; BACKUP_REFERENCE=$2; shift 2 ;;
    --previous-release) (($# >= 2)) || die '--previous-release requires a value'; PREVIOUS_RELEASE=$2; shift 2 ;;
    --evidence-dir) (($# >= 2)) || die '--evidence-dir requires a path'; EVIDENCE_DIR=$2; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done

[[ $BACKUP_REFERENCE =~ ^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$ ]] \
  || die '--backup-reference must be a non-secret reference using only URL-safe punctuation'
[[ $PREVIOUS_RELEASE =~ ^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$ ]] \
  || die '--previous-release must be a non-secret source or release reference using only URL-safe punctuation'

strip_quotes() {
  local value=$1
  if [[ $value == \"*\" && $value == *\" ]] || [[ $value == \'*\' && $value == *\' ]]; then
    value=${value:1:${#value}-2}
  fi
  printf '%s' "$value"
}

load_update_env() {
  [[ -f $ENV_FILE ]] || die "missing installer environment file: $ENV_FILE"
  if IFS= read -r -d '' _ < "$ENV_FILE"; then die 'installer environment file contains a NUL byte'; fi
  local line key value
  while IFS= read -r line || [[ -n $line ]]; do
    line=${line%$'\r'}
    [[ -z $line || $line == \#* ]] && continue
    [[ $line == *=* ]] || die "invalid line in $ENV_FILE"
    key=${line%%=*}; value=$(strip_quotes "${line#*=}")
    case "$key" in
      APP_PORT|POSTGRES_ADMIN_PASSWORD|MIGRATOR_PASSWORD|RUNTIME_PASSWORD|INITIAL_ADMIN_USERNAME|INITIAL_ADMIN_EMAIL|NAUTT_ENCRYPTION_KEY|NAUTT_WEBHOOK_CALLBACK_URL|NAUTT_API_BASE_URL)
        printf -v "$key" '%s' "$value" ;;
      *) die "unsupported variable in $ENV_FILE: $key" ;;
    esac
  done < "$ENV_FILE"
  for key in APP_PORT NAUTT_WEBHOOK_CALLBACK_URL; do
    [[ -n ${!key:-} ]] || die "required variable is missing: $key"
  done
  [[ $APP_PORT =~ ^[1-9][0-9]{0,4}$ ]] && ((10#$APP_PORT <= 65535)) \
    || die 'APP_PORT must be between 1 and 65535'
  [[ $NAUTT_WEBHOOK_CALLBACK_URL =~ ^https://[^[:space:]#@]+(/[^[:space:]#]*)?$ ]] \
    || die 'NAUTT_WEBHOOK_CALLBACK_URL must be an absolute HTTPS URL without credentials or a fragment'
  if [[ -n ${NAUTT_API_BASE_URL:-} ]]; then
    [[ $NAUTT_API_BASE_URL =~ ^https://[^[:space:]#@]+(/[^[:space:]#]*)?$ ]] \
      || die 'NAUTT_API_BASE_URL must be an absolute HTTPS URL without credentials or a fragment'
  fi
}

check_prerequisites() {
  command -v docker >/dev/null 2>&1 || die 'Docker Engine is required'
  command -v sha256sum >/dev/null 2>&1 || die 'sha256sum is required'
  command -v git >/dev/null 2>&1 || die 'git is required to capture rollback evidence'
  docker compose version >/dev/null 2>&1 || die 'the Docker Compose v2 plugin is required'
  docker info >/dev/null 2>&1 || die 'the current user cannot access the Docker daemon'
}

SOURCE_SECRETS_DIR=$ROOT_DIR/.install-secrets
STAGED_SECRETS_DIR=$ROOT_DIR/.container-secrets
POSTGRES_ADMIN_PASSWORD_FILE=$SOURCE_SECRETS_DIR/postgres_admin_password
MIGRATOR_PASSWORD_FILE=$SOURCE_SECRETS_DIR/migrator_password
RUNTIME_PASSWORD_FILE=$SOURCE_SECRETS_DIR/runtime_password

compose() {
  APP_PORT=$APP_PORT POSTGRES_PORT=$POSTGRES_PORT \
    POSTGRES_ADMIN_PASSWORD_FILE=$POSTGRES_ADMIN_PASSWORD_FILE \
    MIGRATOR_PASSWORD_FILE=$MIGRATOR_PASSWORD_FILE RUNTIME_PASSWORD_FILE=$RUNTIME_PASSWORD_FILE \
    NAUTT_WEBHOOK_CALLBACK_URL=$NAUTT_WEBHOOK_CALLBACK_URL NAUTT_API_BASE_URL=${NAUTT_API_BASE_URL:-} \
    STAGED_SECRETS_DIR=$STAGED_SECRETS_DIR \
    docker compose -f "$ROOT_DIR/compose.yaml" -p "$PROJECT" "$@"
}

require_protected_file() {
  local file=$1 expected_mode=$2 expected_uid=$3 metadata
  [[ -f $file && ! -L $file ]] || die 'required protected secret artifact is missing or unsafe'
  metadata=$(stat -c '%u:%a' "$file")
  [[ $metadata == "$expected_uid:$expected_mode" ]] || die 'protected secret artifact ownership or mode is invalid'
}

validate_secret_continuity() {
  local current_uid source_name staged_name
  current_uid=$(id -u)
  [[ -d $SOURCE_SECRETS_DIR && ! -L $SOURCE_SECRETS_DIR ]] || die 'source secret directory is missing or unsafe'
  [[ -d $STAGED_SECRETS_DIR && ! -L $STAGED_SECRETS_DIR ]] || die 'staged secret directory is missing or unsafe'
  [[ $(stat -c '%u:%a' "$SOURCE_SECRETS_DIR") == "$current_uid:700" ]] || die 'source secret directory ownership or mode is invalid'
  [[ $(stat -c '%a' "$STAGED_SECRETS_DIR") == 700 ]] || die 'staged secret directory mode is invalid'
  for source_name in postgres_admin_password migrator_password runtime_password nautt_encryption_key initial_admin_username initial_admin_email initial_admin_password; do
    require_protected_file "$SOURCE_SECRETS_DIR/$source_name" 600 "$current_uid"
  done
  for staged_name in admin_password migrator_password runtime_password nautt_encryption_key initial_admin_username initial_admin_email initial_admin_password; do
    require_protected_file "$STAGED_SECRETS_DIR/$staged_name" 400 1000
  done
  local source_key
  source_key=$(<"$SOURCE_SECRETS_DIR/nautt_encryption_key")
  [[ $source_key =~ ^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$ ]] \
    || die 'stored Nautt encryption key is not a canonical 32-byte base64url value'
  cmp -s "$SOURCE_SECRETS_DIR/nautt_encryption_key" "$STAGED_SECRETS_DIR/nautt_encryption_key" \
    || die 'source and staged Nautt encryption keys differ'
  if [[ -n ${NAUTT_ENCRYPTION_KEY:-} && $NAUTT_ENCRYPTION_KEY != "$source_key" ]]; then
    die 'NAUTT_ENCRYPTION_KEY does not match the installed key'
  fi
  unset source_key
}

inspect_installation() {
  local volume_metadata db_id container_metadata mounts
  volume_metadata=$(docker volume inspect --format '{{.Driver}}|{{index .Labels "com.docker.compose.project"}}|{{index .Labels "com.docker.compose.volume"}}|{{.Name}}' "$VOLUME_NAME" 2>/dev/null) \
    || die 'the supported PostgreSQL volume does not exist'
  [[ $volume_metadata == "local|$PROJECT|postgres-data|$VOLUME_NAME" ]] \
    || die 'PostgreSQL volume ownership, logical name, driver, or identity is incompatible'
  db_id=$(compose ps -q db)
  [[ -n $db_id ]] || die 'the Compose-owned database container does not exist'
  container_metadata=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}' "$db_id") \
    || die 'the database container cannot be inspected'
  [[ $container_metadata == "$PROJECT|db" ]] || die 'database container ownership is incompatible'
  mounts=$(docker inspect --format '{{range .Mounts}}{{printf "%s|%s\n" .Name .Destination}}{{end}}' "$db_id") \
    || die 'database mounts cannot be inspected'
  [[ $mounts == "$VOLUME_NAME|/var/lib/postgresql" ]] \
    || die 'database container does not mount the supported volume at the expected destination'
  printf '%s' "$db_id"
}

volume_identity() {
  docker volume inspect --format '{{.Name}}|{{.Mountpoint}}|{{.CreatedAt}}' "$VOLUME_NAME" \
    || die 'PostgreSQL volume identity cannot be inspected'
}

prepare_evidence_directory() {
  local current_uid
  current_uid=$(id -u)
  if [[ -e $EVIDENCE_DIR ]]; then
    [[ -d $EVIDENCE_DIR && ! -L $EVIDENCE_DIR ]] || die 'evidence path is not a safe directory'
  else
    mkdir -m 0700 "$EVIDENCE_DIR" || die 'cannot create evidence directory'
  fi
  chmod 0700 "$EVIDENCE_DIR"
  [[ $(stat -c '%u:%a' "$EVIDENCE_DIR") == "$current_uid:700" ]] \
    || die 'evidence directory ownership or mode is invalid'
}

capture_evidence() {
  local db_id=$1 volume_identity_before=$2 timestamp run_id temporary_file final_file git_revision git_state
  local compose_version config_fingerprint migration_digest migration_names container_images
  timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
  run_id=$(date -u +'%Y%m%dT%H%M%SZ')-$$
  final_file=$EVIDENCE_DIR/update-$run_id.txt
  temporary_file=$(mktemp "$EVIDENCE_DIR/.update-$run_id.XXXXXX") || die 'cannot create rollback evidence'
  chmod 0600 "$temporary_file"
  git_revision=$(git -C "$ROOT_DIR" rev-parse --verify HEAD) || die 'cannot resolve target Git revision'
  if [[ -n $(git -C "$ROOT_DIR" status --porcelain --untracked-files=no) ]]; then git_state=dirty; else git_state=clean; fi
  compose_version=$(docker compose version --short) || die 'cannot capture Compose version'
  config_fingerprint=$(compose config | sha256sum | cut -d' ' -f1) || die 'cannot fingerprint Compose configuration'
  migration_names=$(find "$ROOT_DIR/prisma/migrations" -mindepth 2 -maxdepth 2 -name migration.sql -printf '%P\n' | LC_ALL=C sort)
  [[ -n $migration_names ]] || die 'cannot enumerate expected migrations'
  migration_digest=$(while IFS= read -r migration; do sha256sum "$ROOT_DIR/prisma/migrations/$migration"; done <<< "$migration_names" | sha256sum | cut -d' ' -f1) \
    || die 'cannot digest expected migrations'
  container_images=$(for service in db bootstrap migrate identity-seed app; do
    local id image
    id=$(compose ps -a -q "$service")
    [[ -n $id ]] || continue
    image=$(docker inspect --format '{{.Image}}' "$id") || exit 1
    printf '%s_container=%s\n%s_image=%s\n' "$service" "$id" "$service" "$image"
  done) || die 'cannot capture current container image identities'
  {
    printf 'format=qr-pagamentos-update-evidence-v1\n'
    printf 'captured_at=%s\nrun_id=%s\n' "$timestamp" "$run_id"
    printf 'previous_release=%s\nbackup_reference=%s\n' "$PREVIOUS_RELEASE" "$BACKUP_REFERENCE"
    printf 'target_git_revision=%s\ntarget_git_state=%s\n' "$git_revision" "$git_state"
    printf 'compose_project=%s\ncompose_version=%s\nvolume_name=%s\nvolume_driver=local\nvolume_logical_name=postgres-data\nvolume_identity=%s\n' "$PROJECT" "$compose_version" "$VOLUME_NAME" "$volume_identity_before"
    printf 'database_container_id=%s\nconfiguration_sha256=%s\n' "$db_id" "$config_fingerprint"
    printf 'migration_set_sha256=%s\nmigrations_begin\n%s\nmigrations_end\n' "$migration_digest" "$migration_names"
    printf 'images_begin\n%s\nimages_end\n' "$container_images"
  } > "$temporary_file" || die 'cannot write rollback evidence'
  [[ -s $temporary_file ]] || die 'rollback evidence is incomplete'
  mv "$temporary_file" "$final_file" || die 'cannot preserve rollback evidence atomically'
  chmod 0400 "$final_file"
  printf '%s' "$final_file"
}

verify_startup() {
  local service id exit_code logs
  for service in bootstrap migrate identity-seed; do
    id=$(compose ps -a -q "$service")
    [[ -n $id ]] || die "startup gate container is missing: $service"
    exit_code=$(docker inspect --format '{{.State.ExitCode}}' "$id")
    [[ $exit_code == 0 ]] || die "startup gate failed: $service"
  done
  logs=$(compose logs --no-color app)
  grep -F 'PASS runtime-db-preflight' <<< "$logs" >/dev/null || die 'runtime database preflight evidence is missing'
  compose exec -T app node container/healthcheck.mjs >/dev/null \
    || die 'application did not return the exact health response'
}

dry_run() {
  printf 'DRY-RUN validate existing protected source and staged secret artifacts without rewriting them\n'
  print_command docker volume inspect "$VOLUME_NAME"
  print_command docker compose -f "$ROOT_DIR/compose.yaml" -p "$PROJECT" ps -q db
  print_command docker inspect compatible-db-labels-and-mount
  printf 'DRY-RUN atomically preserve mode-0400 redacted rollback evidence before mutation\n'
  print_command docker compose -f "$ROOT_DIR/compose.yaml" -p "$PROJECT" build --pull
  print_command docker compose -f "$ROOT_DIR/compose.yaml" -p "$PROJECT" up -d
  print_command docker compose -f "$ROOT_DIR/compose.yaml" -p "$PROJECT" exec -T app node container/healthcheck.mjs
  printf 'DRY-RUN verify bootstrap migrate identity-seed runtime-preflight exact-health and unchanged-volume-identity\n'
  printf 'PASS update-dry-run\n'
}

load_update_env
if "$DRY_RUN"; then dry_run; exit 0; fi
check_prerequisites
validate_secret_continuity
db_id=$(inspect_installation)
volume_identity_before=$(volume_identity)
prepare_evidence_directory
evidence_file=$(capture_evidence "$db_id" "$volume_identity_before")
printf 'PASS update-evidence file=%s\n' "$evidence_file"
compose build --pull
compose up -d
[[ $(inspect_installation) ]] || die 'PostgreSQL installation ownership changed after deployment'
[[ $(volume_identity) == "$volume_identity_before" ]] || die 'PostgreSQL volume identity changed after deployment'
verify_startup
printf 'PASS update-complete evidence=%s\n' "$evidence_file"
