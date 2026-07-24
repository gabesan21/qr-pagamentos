#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd "$INSTALL_DIR/.." && pwd)
PROJECT=${CONTAINER_TEST_PROJECT:-qr-pagamentos}
ENV_FILE=$INSTALL_DIR/.env
DESTINATION=
POSTGRES_IMAGE='postgres:18.4-bookworm@sha256:1961f96e6029a02c3812d7cb329a3b03a3ac2bb067058dec17b0f5596aca9296'

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
# shellcheck source=install/lib-operations.sh
source "$INSTALL_DIR/lib-operations.sh"

while (($#)); do
  case "$1" in
    --env-file) (($# >= 2)) || die '--env-file requires a path'; ENV_FILE=$2; shift 2 ;;
    --destination) (($# >= 2)) || die '--destination requires a path'; DESTINATION=$2; shift 2 ;;
    *) die "unknown argument: $1" ;;
  esac
done
[[ -n $DESTINATION && -d $DESTINATION && ! -L $DESTINATION ]] || die 'destination must be an existing regular directory'
DESTINATION=$(realpath "$DESTINATION")
[[ $DESTINATION != "$ROOT_DIR" && $DESTINATION != "$ROOT_DIR/"* ]] || die 'backup destination must be outside the checkout'
[[ $(stat -c '%u:%a' "$DESTINATION") == "$(id -u):700" ]] || die 'backup destination must be invoking-user-owned mode 0700'
[[ -f $ENV_FILE ]] || die 'installer environment file is missing'

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
    docker compose -f "$ROOT_DIR/compose.yaml" -p "$PROJECT" "$@"
}

operation_lock "$ROOT_DIR" "${QR_OPERATION_LOCK_FD:-}"
volume_contract "$PROJECT" postgres-data "${PROJECT}_postgres-data" || die 'PostgreSQL volume is missing or foreign'
volume_contract "$PROJECT" media-data "${PROJECT}_media-data" || die 'media volume is missing or foreign'
app_id=$(compose ps -q app)
[[ -n $app_id && $(docker inspect --format '{{.State.Health.Status}}' "$app_id") == healthy ]] || die 'supported healthy application is required'
app_image=$(docker inspect --format '{{.Image}}' "$app_id")
revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$app_image")
[[ $revision =~ ^[a-f0-9]{40}$ ]] || die 'installed application revision is not exact'

name="qr-pair-$(date -u +'%Y%m%dT%H%M%SZ')"
published=$DESTINATION/$name
[[ ! -e $published ]] || die 'backup destination already contains this immutable set'
work=$(mktemp -d "$DESTINATION/.${name}.XXXXXX")
chmod 0700 "$work"
stopped=false
cleanup() {
  status=$?
  if "$stopped"; then compose start app >/dev/null 2>&1 || true; fi
  if ((status != 0)); then rm -rf -- "$work"; fi
  exit "$status"
}
trap cleanup EXIT

compose stop app >/dev/null
stopped=true
[[ -z $(compose ps -q app --status running) ]] || die 'application mutation boundary did not quiesce'

docker run --rm --pull=never --network "${PROJECT}_database" --read-only --tmpfs /tmp \
  --volume "$POSTGRES_ADMIN_PASSWORD_FILE:/run/admin-password:ro" \
  --volume "$RUNTIME_PASSWORD_FILE:/run/runtime-password:ro" --volume "$work:/out" \
  "$POSTGRES_IMAGE" sh -eu -c \
  'PGPASSWORD=$(cat /run/admin-password); export PGPASSWORD; pg_dump -h db -p 5433 -U postgres -d qr_pagamentos -Fc -f /out/database.dump; PGPASSWORD=$(cat /run/runtime-password); export PGPASSWORD; psql -h db -p 5433 -U qr_runtime -d qr_pagamentos -AtF "	" -c "SELECT storage_key, byte_size, sha256, state::text FROM app.media_object ORDER BY storage_key" > /out/media.inventory'

docker run --rm --pull=never --network none --read-only --tmpfs /tmp --user 1000:1000 \
  --volume "${PROJECT}_media-data:/app/media:ro" --volume "$work:/out" --entrypoint node \
  "$app_image" container/media-inventory.mjs /out/media.inventory /app/media >/dev/null
rm -f -- "$work/media.inventory"
docker run --rm --pull=never --network none --read-only --tmpfs /tmp --user 1000:1000 \
  --volume "${PROJECT}_media-data:/app/media:ro" --volume "$work:/out" --entrypoint tar \
  "$app_image" --numeric-owner -C /app/media -cpf /out/media.tar .

node "$INSTALL_DIR/pair-manifest.mjs" create "$work/manifest.json" "$revision" "$PROJECT" \
  "${PROJECT}_postgres-data" "${PROJECT}_media-data" \
  "$(volume_identity "${PROJECT}_postgres-data")" "$(volume_identity "${PROJECT}_media-data")" \
  "$work/database.dump" "$work/media.tar"
node "$INSTALL_DIR/pair-manifest.mjs" verify "$work/manifest.json" >/dev/null
chmod 0600 "$work/database.dump" "$work/media.tar" "$work/manifest.json"
mv -- "$work" "$published"
work=$published
compose start app >/dev/null
stopped=false
for _ in {1..60}; do
  [[ $(docker inspect --format '{{.State.Health.Status}}' "$(compose ps -q app)") == healthy ]] && break
  sleep 1
done
[[ $(docker inspect --format '{{.State.Health.Status}}' "$(compose ps -q app)") == healthy ]] || die 'application did not recover after backup'
trap - EXIT
printf 'PASS media-backup set=%s\n' "$published"
