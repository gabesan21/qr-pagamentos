#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd "$INSTALL_DIR/.." && pwd)
PROJECT=${CONTAINER_TEST_PROJECT:-qr-pagamentos}
ENV_FILE=$INSTALL_DIR/.env
BACKUP=
CONFIRM=
POSTGRES_IMAGE='postgres:18.4-bookworm@sha256:1961f96e6029a02c3812d7cb329a3b03a3ac2bb067058dec17b0f5596aca9296'
NODE_HELPER='node:26.4.0-bookworm-slim@sha256:ec82d089a8ae2cf02628da7b34ea57dc357b24db724d557fe2d240e6beb659c1'

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
# shellcheck source=install/lib-operations.sh
source "$INSTALL_DIR/lib-operations.sh"

if [[ -n ${CONTAINER_TEST_RESTORE_INJECT:-} ]]; then
  [[ ${CONTAINER_TEST_CLEAN_CLONE:-} == 1 && $PROJECT =~ ^qrct[[:alnum:]]+$ ]] \
    || die 'restore fault injection is restricted to a clean-clone disposable project'
fi
if [[ -n ${CONTAINER_TEST_OPERATOR_UID:-} ]]; then
  [[ ${CONTAINER_TEST_CLEAN_CLONE:-} == 1 && $PROJECT =~ ^qrct[[:alnum:]]+$ && $CONTAINER_TEST_OPERATOR_UID =~ ^[1-9][0-9]*$ ]] \
    || die 'operator UID simulation is restricted to a clean-clone disposable project'
fi

while (($#)); do
  case "$1" in
    --env-file) (($# >= 2)) || die '--env-file requires a path'; ENV_FILE=$2; shift 2 ;;
    --backup) (($# >= 2)) || die '--backup requires a path'; BACKUP=$2; shift 2 ;;
    --confirm) (($# >= 2)) || die '--confirm requires a token'; CONFIRM=$2; shift 2 ;;
    *) die "unknown argument: $1" ;;
  esac
done
[[ $CONFIRM == "RESTORE:$PROJECT" ]] || die 'restore confirmation is missing or incorrect'
[[ -d $BACKUP && ! -L $BACKUP ]] || die 'backup set is missing or unsafe'
BACKUP=$(realpath "$BACKUP")
manifest=$BACKUP/manifest.json
revision=$(node "$INSTALL_DIR/pair-manifest.mjs" verify "$manifest") || die 'backup validation failed'
manifest_identity=$(node -e 'const m=require(process.argv[1]);process.stdout.write(`${m.compose_project}|${m.database_volume}|${m.media_volume}`)' "$manifest")
[[ $manifest_identity == "$PROJECT|${PROJECT}_postgres-data|${PROJECT}_media-data" ]] \
  || die 'backup project or volume identity does not match the managed target'
[[ $(git -C "$ROOT_DIR" rev-parse HEAD) == "$revision" ]] || die 'checkout is not at the manifest revision'
[[ -z $(git -C "$ROOT_DIR" status --porcelain --untracked-files=all) ]] || die 'restore requires a clean exact-release checkout'
app_image=$(node -e 'const m=require(process.argv[1]);process.stdout.write(m.application_image)' "$manifest")
db_ops_image=$(node -e 'const m=require(process.argv[1]);process.stdout.write(m.database_operations_image)' "$manifest")
[[ $app_image == "${PROJECT}-app:$revision" && $db_ops_image == "${PROJECT}-db-ops:$revision" ]] \
  || die 'manifest exact image identity is invalid'
[[ $(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$app_image" 2>/dev/null) == "$revision" ]] \
  || die 'exact manifest application image is unavailable'
[[ $(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$db_ops_image" 2>/dev/null) == "$revision" ]] \
  || die 'exact manifest database-operations image is unavailable'

APP_PORT=$(sed -n 's/^APP_PORT=//p' "$ENV_FILE" | tail -1)
NAUTT_WEBHOOK_CALLBACK_URL=$(sed -n 's/^NAUTT_WEBHOOK_CALLBACK_URL=//p' "$ENV_FILE" | tail -1)
SOURCE_SECRETS_DIR=$ROOT_DIR/.install-secrets
STAGED_SECRETS_DIR=$ROOT_DIR/.container-secrets
POSTGRES_ADMIN_PASSWORD_FILE=$SOURCE_SECRETS_DIR/postgres_admin_password
MIGRATOR_PASSWORD_FILE=$SOURCE_SECRETS_DIR/migrator_password
RUNTIME_PASSWORD_FILE=$SOURCE_SECRETS_DIR/runtime_password
compose() {
  APP_PORT=$APP_PORT POSTGRES_ADMIN_PASSWORD_FILE=$POSTGRES_ADMIN_PASSWORD_FILE \
    MIGRATOR_PASSWORD_FILE=$MIGRATOR_PASSWORD_FILE RUNTIME_PASSWORD_FILE=$RUNTIME_PASSWORD_FILE \
    STAGED_SECRETS_DIR=$STAGED_SECRETS_DIR NAUTT_WEBHOOK_CALLBACK_URL=$NAUTT_WEBHOOK_CALLBACK_URL \
    APP_IMAGE=$app_image DB_OPS_IMAGE=$db_ops_image RELEASE_REVISION=$revision \
    docker compose -f "$ROOT_DIR/compose.yaml" -p "$PROJECT" "$@"
}

operation_lock "$ROOT_DIR"
volume_contract "$PROJECT" postgres-data "${PROJECT}_postgres-data" || die 'managed PostgreSQL volume is missing or foreign'
volume_contract "$PROJECT" media-data "${PROJECT}_media-data" || die 'managed media volume is missing or foreign'
managed_identity="$(volume_identity "${PROJECT}_postgres-data");$(volume_identity "${PROJECT}_media-data")"
manifest_volume_identity=$(node -e 'const m=require(process.argv[1]);process.stdout.write(`${m.database_volume_identity};${m.media_volume_identity}`)' "$manifest")
[[ $manifest_volume_identity == "$managed_identity" ]] || die 'backup volume identity does not match the managed pair'
validate_retained_credentials "$ROOT_DIR"

operation="${PROJECT}-restore-${revision:0:8}-$$"
candidate_db="${operation}-db"
candidate_health="${operation}-health"
candidate_network="${operation}-network"
candidate_db_volume="${operation}-postgres"
candidate_media_volume="${operation}-media"
candidate_secret_volume="${operation}-secrets"
inventory=("$candidate_health" "$candidate_db" "$candidate_network" "$candidate_db_volume" "$candidate_media_volume" "$candidate_secret_volume")
teardown_injection_pending=true

restore_injected() {
  [[ ",${CONTAINER_TEST_RESTORE_INJECT:-}," == *",$1,"* ]]
}

resource_absent() {
  ! docker container inspect "$candidate_health" >/dev/null 2>&1 \
    && ! docker container inspect "$candidate_db" >/dev/null 2>&1 \
    && ! docker network inspect "$candidate_network" >/dev/null 2>&1 \
    && ! docker volume inspect "$candidate_db_volume" >/dev/null 2>&1 \
    && ! docker volume inspect "$candidate_media_volume" >/dev/null 2>&1 \
    && ! docker volume inspect "$candidate_secret_volume" >/dev/null 2>&1
}
teardown_rehearsal() {
  local failed=false
  if "$teardown_injection_pending" && restore_injected rehearsal-teardown; then
    teardown_injection_pending=false
    return 1
  fi
  if docker container inspect "$candidate_health" >/dev/null 2>&1; then
    docker rm -f "$candidate_health" >/dev/null 2>&1 || failed=true
  fi
  if docker container inspect "$candidate_db" >/dev/null 2>&1; then
    docker rm -f "$candidate_db" >/dev/null 2>&1 || failed=true
  fi
  if docker network inspect "$candidate_network" >/dev/null 2>&1; then
    docker network rm "$candidate_network" >/dev/null 2>&1 || failed=true
  fi
  for volume in "$candidate_db_volume" "$candidate_media_volume" "$candidate_secret_volume"; do
    if docker volume inspect "$volume" >/dev/null 2>&1; then
      docker volume rm "$volume" >/dev/null 2>&1 || failed=true
    fi
  done
  resource_absent || failed=true
  trap - EXIT
  ! "$failed"
}
trap teardown_rehearsal EXIT
resource_absent || die 'restore rehearsal inventory already exists'

for entry in "$candidate_db_volume:rehearsal-db" "$candidate_media_volume:rehearsal-media"; do
  docker volume create --driver local --label "qr.purpose=${entry#*:}" --label "qr.operation=$operation" "${entry%%:*}" >/dev/null
done
docker volume create --driver local --label "qr.purpose=rehearsal-secrets" --label "qr.operation=$operation" "$candidate_secret_volume" >/dev/null
docker run --rm --pull=never --network none --read-only --tmpfs /tmp \
  --user 0:0 -v "$candidate_secret_volume:/stage" "$NODE_HELPER" node -e \
  'const f=require("node:fs");f.chownSync("/stage",1000,1000);f.chmodSync("/stage",0o700)' >/dev/null
docker run --rm --pull=never --network none --read-only --tmpfs /tmp \
  --user 1000:1000 -v "$candidate_secret_volume:/stage" "$NODE_HELPER" node -e \
  'const f=require("node:fs"),c=require("node:crypto");for(const [n,b] of [["admin",24],["runtime_password",24],["nautt_encryption_key",32]])f.writeFileSync(`/stage/${n}`,c.randomBytes(b).toString("base64url"),{mode:0o400,flag:"wx"});for(const n of f.readdirSync("/stage")){const s=f.lstatSync(`/stage/${n}`);if(!s.isFile()||s.uid!==1000||s.gid!==1000||(s.mode&0o777)!==0o400)process.exit(1)}' \
  || die 'candidate secret staging failed'
if [[ -n ${CONTAINER_TEST_OPERATOR_UID:-} ]]; then
  [[ $CONTAINER_TEST_OPERATOR_UID != 1000 ]] || die 'operator UID simulation must differ from container UID'
  printf 'PASS restore-secret-staging operator_uid=%s container_uid=1000\n' "$CONTAINER_TEST_OPERATOR_UID"
fi
docker network create --internal --label "qr.purpose=rehearsal-db" --label "qr.operation=$operation" "$candidate_network" >/dev/null
docker run -d --name "$candidate_db" --label "qr.purpose=rehearsal-db" --label "qr.operation=$operation" \
  --network "$candidate_network" --network-alias db \
  -e POSTGRES_PASSWORD_FILE=/run/candidate/admin -v "$candidate_secret_volume:/run/candidate:ro" \
  -v "$candidate_db_volume:/var/lib/postgresql" "$POSTGRES_IMAGE" -p 5433 >/dev/null
for _ in {1..60}; do
  docker exec "$candidate_db" pg_isready -U postgres -d postgres -p 5433 >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$candidate_db" pg_isready -U postgres -d postgres -p 5433 >/dev/null || die 'rehearsal database did not start'
docker cp "$BACKUP/database.dump" "$candidate_db:/run/database.dump"
docker run --rm --pull=never --network none --read-only --tmpfs /tmp --user 1000:1000 \
  -v "$candidate_secret_volume:/run/candidate:ro" "$NODE_HELPER" node -e \
  'const f=require("node:fs");const p=f.readFileSync("/run/candidate/runtime_password","utf8"),q=String.fromCharCode(39);process.stdout.write(`CREATE ROLE qr_migrator LOGIN PASSWORD ${q}${p}${q};\nCREATE ROLE qr_runtime LOGIN PASSWORD ${q}${p}${q};\nGRANT CREATE ON DATABASE qr_pagamentos TO qr_migrator;\n`)' \
  | docker exec -i "$candidate_db" sh -eu -c 'PGPASSWORD=$(cat /run/candidate/admin); export PGPASSWORD; createdb -U postgres -p 5433 qr_pagamentos; psql -U postgres -p 5433 -d qr_pagamentos -f -; status=0; pg_restore -U postgres -p 5433 -d qr_pagamentos --role=qr_migrator --no-owner --no-acl /run/database.dump || status=$?; psql -U postgres -p 5433 -d qr_pagamentos -c "REVOKE CREATE ON DATABASE qr_pagamentos FROM qr_migrator" >/dev/null; exit "$status"' \
  >/dev/null 2>&1 || die 'rehearsal database restore failed'
docker exec "$candidate_db" sh -eu -c 'PGPASSWORD=$(cat /run/candidate/admin); export PGPASSWORD; psql -U postgres -p 5433 -d qr_pagamentos -Atc "SELECT count(*) FROM app._prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL" | grep -qx 0' \
  || die 'rehearsal migration metadata failed'

docker run --rm --network none --read-only --tmpfs /tmp --user 1000:1000 \
  -v "$candidate_media_volume:/app/media" -v "$BACKUP/media.tar:/run/media.tar:ro" --entrypoint tar \
  "$app_image" --numeric-owner -C /app/media -xpf /run/media.tar
docker run --rm --network none --read-only --tmpfs /tmp --user 1000:1000 \
  -v "$candidate_media_volume:/app/media" --entrypoint node "$app_image" container/media-preflight.mjs >/dev/null
docker exec "$candidate_db" sh -eu -c 'PGPASSWORD=$(cat /run/candidate/admin); export PGPASSWORD; psql -U postgres -p 5433 -d qr_pagamentos -AtF "	" -c "SELECT storage_key, byte_size, sha256, state::text FROM app.media_object ORDER BY storage_key"' \
  | docker run --rm -i --network none --read-only --tmpfs /tmp --user 1000:1000 \
    -v "$candidate_media_volume:/app/media:ro" --entrypoint node "$app_image" container/media-inventory.mjs - /app/media >/dev/null \
  || die 'rehearsal media inventory failed'
docker run -d --name "$candidate_health" --label "qr.purpose=rehearsal-health" --label "qr.operation=$operation" \
  --network "$candidate_network" --read-only --tmpfs /tmp:uid=1000,gid=1000,mode=0700 \
  --tmpfs /app/.next/cache:uid=1000,gid=1000,mode=0700 --user 1000:1000 \
  -e POSTGRES_HOST=db -e POSTGRES_PORT=5433 -e MEDIA_STORAGE_ROOT=/app/media \
  -e NAUTT_WEBHOOK_CALLBACK_URL=https://rehearsal.invalid/api/nautt/webhooks \
  -v "$candidate_media_volume:/app/media" \
  -v "$candidate_secret_volume:/run/secrets:ro" \
  "$app_image" >/dev/null
for _ in {1..60}; do
  docker exec "$candidate_health" node container/healthcheck.mjs >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$candidate_health" node container/healthcheck.mjs >/dev/null || die 'exact-release rehearsal health failed'
teardown_rehearsal || die 'restore rehearsal inventory teardown failed'
trap - EXIT
resource_absent || die 'rehearsal inventory remained before managed mutation'

recovery_parent="$(dirname "$BACKUP")/.${operation}-recovery"
mkdir -m 0700 "$recovery_parent"
recovery_output=$(QR_OPERATION_LOCK_FD=$OPERATION_LOCK_FD "$INSTALL_DIR/backup.sh" --env-file "$ENV_FILE" --destination "$recovery_parent")
recovery_set=${recovery_output##*set=}
[[ -d $recovery_set ]] || die 'protected automatic recovery set was not created'

restore_managed_pair() {
  local set=$1
  local attempt=$2
  node "$INSTALL_DIR/pair-manifest.mjs" verify "$set/manifest.json" >/dev/null \
    || return 1
  compose down --remove-orphans >/dev/null \
    || return 1
  docker run --rm --network none -v "${PROJECT}_postgres-data:/var/lib/postgresql" "$POSTGRES_IMAGE" \
    sh -eu -c 'find /var/lib/postgresql -mindepth 1 -delete' \
    || return 1
  compose up -d db >/dev/null \
    || return 1
  for _ in {1..60}; do compose exec -T db pg_isready -U postgres -d postgres -p 5433 >/dev/null 2>&1 && break; sleep 1; done
  compose exec -T db pg_isready -U postgres -d postgres -p 5433 >/dev/null 2>&1 \
    || return 1
  compose run --rm --no-deps bootstrap >/dev/null \
    || return 1
  if ! docker run --rm --network "${PROJECT}_database" --read-only --tmpfs /tmp \
    -v "$POSTGRES_ADMIN_PASSWORD_FILE:/run/admin:ro" -v "$set/database.dump:/run/database.dump:ro" \
    "$POSTGRES_IMAGE" sh -eu -c 'PGPASSWORD=$(cat /run/admin); export PGPASSWORD; psql -h db -p 5433 -U postgres -d qr_pagamentos -c "GRANT CREATE ON DATABASE qr_pagamentos TO qr_migrator" >/dev/null; status=0; pg_restore -h db -p 5433 -U postgres -d qr_pagamentos --role=qr_migrator --no-owner --no-acl --clean --if-exists /run/database.dump || status=$?; psql -h db -p 5433 -U postgres -d qr_pagamentos -c "REVOKE CREATE ON DATABASE qr_pagamentos FROM qr_migrator" >/dev/null; exit "$status"' >/dev/null
  then
    return 1
  fi
  docker run --rm --network none --read-only --tmpfs /tmp --user 1000:1000 \
    -v "${PROJECT}_media-data:/app/media" --entrypoint node "$app_image" -e \
    'const f=require("node:fs");for(const n of ["staging","objects"]){f.rmSync(`/app/media/${n}`,{recursive:true,force:true});f.mkdirSync(`/app/media/${n}`,{mode:0o700})}' \
    || return 1
  docker run --rm --network none --read-only --tmpfs /tmp --user 1000:1000 \
    -v "${PROJECT}_media-data:/app/media" -v "$set/media.tar:/run/media.tar:ro" --entrypoint tar \
    "$app_image" --numeric-owner -C /app/media -xpf /run/media.tar \
    || return 1
  restore_injected "${attempt}-after-mutation" && return 1
  compose exec -T db psql -U postgres -p 5433 -d qr_pagamentos -Atc \
    'SELECT count(*) FROM app._prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL' \
    | grep -qx 0 \
    || return 1
  compose exec -T db psql -U postgres -p 5433 -d qr_pagamentos -AtF $'\t' -c \
    'SELECT storage_key, byte_size, sha256, state::text FROM app.media_object ORDER BY storage_key' \
    | docker run --rm -i --network none --read-only --tmpfs /tmp --user 1000:1000 \
      -v "${PROJECT}_media-data:/app/media:ro" --entrypoint node "$app_image" \
      container/media-inventory.mjs - /app/media >/dev/null \
    || return 1
  compose up -d >/dev/null \
    || return 1
  for _ in {1..120}; do
    if compose exec -T app node container/healthcheck.mjs >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

if ! restore_managed_pair "$BACKUP" primary; then
  if restore_managed_pair "$recovery_set" recovery; then
    [[ "$(volume_identity "${PROJECT}_postgres-data");$(volume_identity "${PROJECT}_media-data")" == "$managed_identity" ]] \
      || die 'automatic recovery changed managed volume identities'
    die 'requested restore failed; original pair recovered'
  fi
  compose stop app >/dev/null 2>&1 || true
  printf 'ERROR restore-recovery code=DOUBLEFAIL recovery=%s\n' "$recovery_parent" >&2
  exit 1
fi
[[ "$(volume_identity "${PROJECT}_postgres-data");$(volume_identity "${PROJECT}_media-data")" == "$managed_identity" ]] \
  || die 'restore changed managed volume identities'
printf 'PASS media-restore recovery=%s\n' "$recovery_parent"
