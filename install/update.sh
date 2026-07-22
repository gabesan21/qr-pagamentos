#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd "$INSTALL_DIR/.." && pwd)
ENV_FILE="$INSTALL_DIR/.env"
EVIDENCE_DIR="$ROOT_DIR/.update-evidence"
PROJECT=${CONTAINER_TEST_PROJECT:-qr-pagamentos}
VOLUME_NAME=${CONTAINER_TEST_VOLUME:-${PROJECT}_postgres-data}
POSTGRES_PORT=5433
NODE_HELPER='node:26.4.0-bookworm-slim@sha256:ec82d089a8ae2cf02628da7b34ea57dc357b24db724d557fe2d240e6beb659c1'

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

ORIGINAL_ARGS=("$@")
while (($#)); do
  case "$1" in
    --env-file) (($# >= 2)) || die '--env-file requires a path'; ENV_FILE=$2; shift 2 ;;
    --evidence-dir) (($# >= 2)) || die '--evidence-dir requires a path'; EVIDENCE_DIR=$2; shift 2 ;;
    --backup-reference|--previous-release) die "$1 was removed; update no longer accepts backup or release metadata" ;;
    *) die "unknown argument: $1" ;;
  esac
done

acquire_update_lock() {
  local lock_name
  lock_name=$(printf '%s' "$ROOT_DIR" | sha256sum | cut -d' ' -f1)
  if [[ ${QR_UPDATE_REENTRY_COUNT:-0} == 0 ]]; then
    [[ -z ${QR_UPDATE_LOCK_FD:-} ]] || die 'external update lock handoff is forbidden'
    exec {UPDATE_LOCK_FD}>"/tmp/qr-pagamentos-update-${lock_name}.lock"
    flock -n "$UPDATE_LOCK_FD" || die 'another update is already running for this checkout'
  else
    [[ ${QR_UPDATE_LOCK_FD:-} =~ ^[0-9]+$ && -e /proc/self/fd/$QR_UPDATE_LOCK_FD ]] \
      || die 'update lock handoff is missing or unsafe'
    UPDATE_LOCK_FD=$QR_UPDATE_LOCK_FD
    flock -n "$UPDATE_LOCK_FD" || die 'update lock handoff is unavailable'
  fi
}

assert_target_checkout() {
  local head
  head=$(git -C "$ROOT_DIR" rev-parse --verify HEAD) || die 'update checkout has no HEAD'
  [[ $head == "$QR_UPDATE_TARGET_SHA" ]] || die 'update checkout revision drifted from its target'
  [[ -z $(git -C "$ROOT_DIR" status --porcelain --untracked-files=all) ]] \
    || die 'update checkout changed during deployment'
}

require_clean_attached_upstream() {
  [[ -z $(git -C "$ROOT_DIR" status --porcelain --untracked-files=all) ]] || die 'working tree must be clean, including untracked files'
  local branch upstream
  branch=$(git -C "$ROOT_DIR" symbolic-ref --quiet --short HEAD) || die 'update requires an attached branch'
  upstream=$(git -C "$ROOT_DIR" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null) \
    || die 'the current branch must have exactly one configured upstream'
  [[ $upstream == */* && $upstream != '@{upstream}' ]] || die 'configured upstream is invalid'
  printf '%s\n%s\n' "$branch" "$upstream"
}

enter_pulled_revision() {
  [[ -z ${QR_UPDATE_REENTRY_COUNT:-} && -z ${QR_UPDATE_TARGET_SHA:-} && -z ${QR_UPDATE_HANDOFF_FILE:-} ]] \
    || die 'external or repeated update handoff is forbidden'
  local topology branch upstream remote remote_branch head upstream_sha ahead behind
  topology=$(require_clean_attached_upstream)
  branch=${topology%%$'\n'*}; upstream=${topology#*$'\n'}
  remote=${upstream%%/*}; remote_branch=${upstream#*/}
  [[ -n $remote && -n $remote_branch ]] || die 'configured upstream is invalid'
  git -C "$ROOT_DIR" fetch --no-tags "$remote" "$remote_branch" \
    || die 'configured upstream is unreachable'
  head=$(git -C "$ROOT_DIR" rev-parse --verify HEAD)
  upstream_sha=$(git -C "$ROOT_DIR" rev-parse --verify '@{upstream}^{commit}') \
    || die 'configured upstream commit is unavailable'
  read -r ahead behind < <(git -C "$ROOT_DIR" rev-list --left-right --count "HEAD...$upstream_sha")
  [[ $ahead == 0 ]] || die 'local branch is ahead of or diverged from its upstream'
  git -C "$ROOT_DIR" merge-base --is-ancestor "$head" "$upstream_sha" \
    || die 'update is not a fast-forward'
  git -C "$ROOT_DIR" pull --ff-only --no-rebase \
    || die 'fast-forward pull failed'
  local target
  target=$(git -C "$ROOT_DIR" rev-parse --verify HEAD)
  [[ $target == "$(git -C "$ROOT_DIR" rev-parse --verify '@{upstream}^{commit}')" ]] \
    || die 'pulled HEAD does not equal the captured upstream commit'
  [[ -z $(git -C "$ROOT_DIR" status --porcelain --untracked-files=all) ]] \
    || die 'pull produced a dirty working tree'
  local handoff_file
  handoff_file=$(mktemp "${TMPDIR:-/tmp}/qr-pagamentos-update-handoff.XXXXXX") || die 'cannot create update handoff'
  chmod 0600 "$handoff_file"
  printf '%s\n' "$target" > "$handoff_file" || die 'cannot write update handoff'
  exec env QR_UPDATE_REENTRY_COUNT=1 QR_UPDATE_TARGET_SHA="$target" QR_UPDATE_HANDOFF_FILE="$handoff_file" QR_UPDATE_LOCK_FD="$UPDATE_LOCK_FD" \
    "$ROOT_DIR/install/update.sh" "${ORIGINAL_ARGS[@]}"
}

verify_reentry() {
  [[ ${QR_UPDATE_REENTRY_COUNT:-} == 1 ]] || die 'invalid update handoff count'
  [[ ${QR_UPDATE_TARGET_SHA:-} =~ ^[0-9a-f]{40}$ ]] || die 'invalid update target revision'
  [[ ${QR_UPDATE_HANDOFF_FILE:-} == /tmp/qr-pagamentos-update-handoff.* ]] || die 'invalid update handoff path'
  [[ -f $QR_UPDATE_HANDOFF_FILE && ! -L $QR_UPDATE_HANDOFF_FILE ]] || die 'update handoff is missing or unsafe'
  [[ $(stat -c '%u:%a' "$QR_UPDATE_HANDOFF_FILE") == "$(id -u):600" ]] || die 'update handoff ownership or mode is invalid'
  [[ $(<"$QR_UPDATE_HANDOFF_FILE") == "$QR_UPDATE_TARGET_SHA" ]] || die 'update handoff target mismatch'
  rm -- "$QR_UPDATE_HANDOFF_FILE" || die 'cannot consume update handoff'
  unset QR_UPDATE_HANDOFF_FILE
  local topology upstream head upstream_sha
  topology=$(require_clean_attached_upstream)
  upstream=${topology#*$'\n'}
  head=$(git -C "$ROOT_DIR" rev-parse --verify HEAD)
  upstream_sha=$(git -C "$ROOT_DIR" rev-parse --verify '@{upstream}^{commit}')
  [[ $head == "$QR_UPDATE_TARGET_SHA" && $upstream_sha == "$QR_UPDATE_TARGET_SHA" ]] \
    || die 'update handoff revision no longer matches HEAD and upstream'
  assert_target_checkout
}

strip_quotes() {
  local value=$1
  if [[ $value == \"*\" && $value == *\" ]] || [[ $value == \'*\' && $value == *\' ]]; then value=${value:1:${#value}-2}; fi
  printf '%s' "$value"
}

load_update_env() {
  [[ -f $ENV_FILE ]] || die "missing installer environment file: $ENV_FILE"
  if IFS= read -r -d '' _ < "$ENV_FILE"; then die 'installer environment file contains a NUL byte'; fi
  local line key value
  while IFS= read -r line || [[ -n $line ]]; do
    line=${line%$'\r'}; [[ -z $line || $line == \#* ]] && continue
    [[ $line == *=* ]] || die "invalid line in $ENV_FILE"
    key=${line%%=*}; value=$(strip_quotes "${line#*=}")
    case "$key" in
      APP_PORT|POSTGRES_ADMIN_PASSWORD|MIGRATOR_PASSWORD|RUNTIME_PASSWORD|INITIAL_ADMIN_USERNAME|INITIAL_ADMIN_EMAIL|NAUTT_ENCRYPTION_KEY|NAUTT_WEBHOOK_CALLBACK_URL|NAUTT_API_BASE_URL) printf -v "$key" '%s' "$value" ;;
      *) die "unsupported variable in $ENV_FILE: $key" ;;
    esac
  done < "$ENV_FILE"
  [[ -n ${APP_PORT:-} && -n ${NAUTT_WEBHOOK_CALLBACK_URL:-} ]] || die 'APP_PORT and NAUTT_WEBHOOK_CALLBACK_URL are required'
  [[ $APP_PORT =~ ^[1-9][0-9]{0,4}$ ]] && ((10#$APP_PORT <= 65535)) || die 'APP_PORT must be between 1 and 65535'
}

check_prerequisites() {
  command -v docker >/dev/null 2>&1 || die 'Docker Engine is required'
  command -v git >/dev/null 2>&1 || die 'git is required'
  command -v flock >/dev/null 2>&1 || die 'flock is required'
  command -v sha256sum >/dev/null 2>&1 || die 'sha256sum is required'
  docker compose version >/dev/null 2>&1 || die 'Docker Compose v2 is required'
  docker info >/dev/null 2>&1 || die 'the current user cannot access the Docker daemon'
  docker image inspect "$NODE_HELPER" >/dev/null 2>&1 \
    || die 'the pinned offline verifier image must already exist'
}

run_offline_policy() {
  docker run --rm --pull=never --network none --read-only --tmpfs /tmp \
    --user "$(id -u):$(id -g)" --volume "$ROOT_DIR:/workspace:ro" --workdir /workspace \
    "$NODE_HELPER" node pop/scripts/migration-policy.mjs verify /workspace
}

SOURCE_SECRETS_DIR=$ROOT_DIR/.install-secrets
STAGED_SECRETS_DIR=$ROOT_DIR/.container-secrets
POSTGRES_ADMIN_PASSWORD_FILE=$SOURCE_SECRETS_DIR/postgres_admin_password
MIGRATOR_PASSWORD_FILE=$SOURCE_SECRETS_DIR/migrator_password
RUNTIME_PASSWORD_FILE=$SOURCE_SECRETS_DIR/runtime_password
DB_OPS_IMAGE=
APP_IMAGE=

compose() {
  APP_PORT=$APP_PORT POSTGRES_PORT=$POSTGRES_PORT RELEASE_REVISION=$QR_UPDATE_TARGET_SHA \
    DB_OPS_IMAGE=$DB_OPS_IMAGE APP_IMAGE=$APP_IMAGE \
    POSTGRES_ADMIN_PASSWORD_FILE=$POSTGRES_ADMIN_PASSWORD_FILE MIGRATOR_PASSWORD_FILE=$MIGRATOR_PASSWORD_FILE \
    RUNTIME_PASSWORD_FILE=$RUNTIME_PASSWORD_FILE NAUTT_WEBHOOK_CALLBACK_URL=$NAUTT_WEBHOOK_CALLBACK_URL \
    NAUTT_API_BASE_URL=${NAUTT_API_BASE_URL:-} STAGED_SECRETS_DIR=$STAGED_SECRETS_DIR \
    docker compose -f "$ROOT_DIR/compose.yaml" -p "$PROJECT" "$@"
}

require_protected_file() {
  local file=$1 expected_mode=$2 expected_uid=$3
  [[ -f $file && ! -L $file ]] || die 'required protected secret artifact is missing or unsafe'
  [[ $(stat -c '%u:%a' "$file") == "$expected_uid:$expected_mode" ]] || die 'protected secret artifact ownership or mode is invalid'
}

validate_secret_continuity() {
  local uid name source_digest source_key
  uid=$(id -u)
  [[ -d $SOURCE_SECRETS_DIR && ! -L $SOURCE_SECRETS_DIR && $(stat -c '%u:%a' "$SOURCE_SECRETS_DIR") == "$uid:700" ]] || die 'source secret directory is unsafe'
  [[ -d $STAGED_SECRETS_DIR && ! -L $STAGED_SECRETS_DIR && $(stat -c '%a' "$STAGED_SECRETS_DIR") == 700 ]] || die 'staged secret directory is unsafe'
  for name in postgres_admin_password migrator_password runtime_password nautt_encryption_key initial_admin_username initial_admin_email initial_admin_password; do require_protected_file "$SOURCE_SECRETS_DIR/$name" 600 "$uid"; done
  for name in admin_password migrator_password runtime_password nautt_encryption_key initial_admin_username initial_admin_email initial_admin_password; do require_protected_file "$STAGED_SECRETS_DIR/$name" 400 1000; done
  source_key=$(<"$SOURCE_SECRETS_DIR/nautt_encryption_key")
  [[ $source_key =~ ^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$ ]] || die 'stored Nautt encryption key is invalid'
  source_digest=$(sha256sum "$SOURCE_SECRETS_DIR/nautt_encryption_key" | cut -d' ' -f1)
  printf '%s\n' "$source_digest" | docker run --rm -i --pull=never --network none --read-only \
    --user 1000:1000 --volume "$STAGED_SECRETS_DIR/nautt_encryption_key:/staged-key:ro" "$NODE_HELPER" \
    sh -eu -c 'IFS= read -r expected; actual=$(sha256sum /staged-key | cut -d" " -f1); test "$actual" = "$expected"' \
    >/dev/null || die 'source and staged Nautt encryption keys differ'
  [[ -z ${NAUTT_ENCRYPTION_KEY:-} || $NAUTT_ENCRYPTION_KEY == "$source_key" ]] || die 'NAUTT_ENCRYPTION_KEY does not match the installed key'
  unset source_key
}

validate_urls() {
  local value
  for value in "$NAUTT_WEBHOOK_CALLBACK_URL" ${NAUTT_API_BASE_URL:+"$NAUTT_API_BASE_URL"}; do
    docker run --rm --pull=never --network none --read-only --user "$(id -u):$(id -g)" "$NODE_HELPER" \
      node -e 'const u=new URL(process.argv[1]);process.exit(u.protocol==="https:"&&!u.username&&!u.password&&!u.hash?0:1)' -- "$value" >/dev/null \
      || die 'Nautt URLs must be absolute HTTPS URLs without credentials or fragments'
  done
}

inspect_installation() {
  local metadata db_id mounts app_id app_health
  metadata=$(docker volume inspect --format '{{.Driver}}|{{index .Labels "com.docker.compose.project"}}|{{index .Labels "com.docker.compose.volume"}}|{{.Name}}' "$VOLUME_NAME" 2>/dev/null) || die 'supported PostgreSQL volume does not exist'
  [[ $metadata == "local|$PROJECT|postgres-data|$VOLUME_NAME" ]] || die 'PostgreSQL volume ownership is incompatible'
  db_id=$(compose ps -q db); [[ -n $db_id ]] || die 'Compose database container does not exist'
  [[ $(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}' "$db_id") == "$PROJECT|db" ]] || die 'database ownership is incompatible'
  mounts=$(docker inspect --format '{{range .Mounts}}{{printf "%s|%s\n" .Name .Destination}}{{end}}' "$db_id")
  [[ $mounts == "$VOLUME_NAME|/var/lib/postgresql" ]] || die 'database volume mount is incompatible'
  app_id=$(compose ps -q app); [[ -n $app_id ]] || die 'existing application container does not exist'
  app_health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$app_id")
  [[ $app_health == healthy ]] || die 'existing application must be healthy before update'
  printf '%s\n%s\n' "$db_id" "$app_id"
}

volume_identity() { docker volume inspect --format '{{.Name}}|{{.Mountpoint}}|{{.CreatedAt}}' "$VOLUME_NAME"; }

prepare_evidence() {
  local uid old_app=$1 old_image=$2 volume=$3 file temporary
  uid=$(id -u)
  if [[ -e $EVIDENCE_DIR ]]; then [[ -d $EVIDENCE_DIR && ! -L $EVIDENCE_DIR ]] || die 'evidence path is unsafe'; else mkdir -m 0700 "$EVIDENCE_DIR"; fi
  chmod 0700 "$EVIDENCE_DIR"
  [[ $(stat -c '%u:%a' "$EVIDENCE_DIR") == "$uid:700" ]] || die 'evidence directory ownership is invalid'
  file=$EVIDENCE_DIR/update-$(date -u +'%Y%m%dT%H%M%SZ')-$$.txt
  temporary=$(mktemp "$EVIDENCE_DIR/.update.XXXXXX")
  chmod 0600 "$temporary"
  {
    printf 'format=qr-pagamentos-update-evidence-v2\n'
    printf 'target_revision=%s\nhead_revision=%s\nupstream_revision=%s\n' "$QR_UPDATE_TARGET_SHA" "$QR_UPDATE_TARGET_SHA" "$QR_UPDATE_TARGET_SHA"
    printf 'previous_app_container=%s\nprevious_app_image=%s\n' "$old_app" "$old_image"
    printf 'compose_project=%s\nvolume_identity=%s\n' "$PROJECT" "$volume"
  } > "$temporary"
  mv "$temporary" "$file"; chmod 0400 "$file"; printf '%s' "$file"
}

image_revision() { docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$1"; }

wait_for_app() {
  local id status
  id=$(compose ps -q app); [[ -n $id ]] || die 'target app container is missing'
  for _ in {1..60}; do
    status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id")
    [[ $status == healthy ]] && { printf '%s' "$id"; return; }
    [[ $status == exited || $status == unhealthy ]] && break
    sleep 1
  done
  die 'target application did not become healthy'
}

acquire_update_lock
if [[ ${QR_UPDATE_REENTRY_COUNT:-0} == 0 ]]; then enter_pulled_revision; fi
verify_reentry
load_update_env
check_prerequisites
run_offline_policy
assert_target_checkout
validate_urls
validate_secret_continuity
DB_OPS_IMAGE="${PROJECT}-db-ops:$QR_UPDATE_TARGET_SHA"
APP_IMAGE="${PROJECT}-app:$QR_UPDATE_TARGET_SHA"
installation=$(inspect_installation)
old_app=${installation#*$'\n'}
old_image=$(docker inspect --format '{{.Image}}' "$old_app")
volume_before=$(volume_identity)
evidence=$(prepare_evidence "$old_app" "$old_image" "$volume_before")
printf 'PASS update-evidence file=%s\n' "$evidence"

# Candidate builds do not mutate the running Compose application.
compose build --pull bootstrap app
assert_target_checkout
[[ $(image_revision "$DB_OPS_IMAGE") == "$QR_UPDATE_TARGET_SHA" ]] || die 'db-ops image revision mismatch'
[[ $(image_revision "$APP_IMAGE") == "$QR_UPDATE_TARGET_SHA" ]] || die 'app image revision mismatch'

# Every invocation creates a new migration container. The old app remains running through this gate.
compose run --rm --no-deps bootstrap
assert_target_checkout
migrate_name="${PROJECT}-update-migrate-${QR_UPDATE_TARGET_SHA:0:12}-$$"
compose run --name "$migrate_name" --no-deps migrate
[[ $(docker inspect --format '{{.State.ExitCode}}' "$migrate_name") == 0 ]] || die 'migration container did not complete successfully'
migrate_image=$(docker inspect --format '{{.Image}}' "$migrate_name")
[[ $(image_revision "$migrate_image") == "$QR_UPDATE_TARGET_SHA" ]] || die 'migration container revision mismatch'

compose run --rm --no-deps identity-seed
assert_target_checkout
compose up -d --no-deps --force-recreate app
target_app=$(wait_for_app)
target_image=$(docker inspect --format '{{.Image}}' "$target_app")
[[ $(image_revision "$target_image") == "$QR_UPDATE_TARGET_SHA" ]] || die 'target app revision mismatch'
[[ $(volume_identity) == "$volume_before" ]] || die 'PostgreSQL volume identity changed'
printf 'PASS update-complete revision=%s migrate=%s app=%s evidence=%s\n' "$QR_UPDATE_TARGET_SHA" "$migrate_name" "$target_app" "$evidence"
