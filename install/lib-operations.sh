#!/usr/bin/env bash

# Shared fail-closed primitives for install, update, uninstall, backup, and restore.
# Callers own user-facing errors through die().

operation_lock() {
  local checkout=$1 inherited_fd=${2:-} lock_name
  lock_name=$(printf '%s' "$checkout" | sha256sum | cut -d' ' -f1)
  if [[ -n $inherited_fd ]]; then
    [[ $inherited_fd =~ ^[0-9]+$ && -e /proc/self/fd/$inherited_fd ]] \
      || die 'operation lock handoff is missing or unsafe'
    OPERATION_LOCK_FD=$inherited_fd
    flock -n "$OPERATION_LOCK_FD" || die 'operation lock handoff is unavailable'
  else
    exec {OPERATION_LOCK_FD}>"/tmp/qr-pagamentos-operation-${lock_name}.lock"
    flock -n "$OPERATION_LOCK_FD" || die 'another data operation is already running for this checkout'
  fi
}

volume_contract() {
  local project=$1 logical=$2 name=$3 metadata
  metadata=$(docker volume inspect --format \
    '{{.Name}}|{{.Driver}}|{{index .Labels "com.docker.compose.project"}}|{{index .Labels "com.docker.compose.volume"}}' \
    "$name" 2>/dev/null) || return 1
  [[ $metadata == "$name|local|$project|$logical" ]]
}

volume_identity() {
  local name=$1
  docker volume inspect --format \
    '{{.Name}}|{{.Driver}}|{{index .Labels "com.docker.compose.project"}}|{{index .Labels "com.docker.compose.volume"}}|{{.CreatedAt}}' \
    "$name"
}

create_owned_volume() {
  local project=$1 logical=$2 name=$3
  docker volume create --driver local \
    --label "com.docker.compose.project=$project" \
    --label "com.docker.compose.volume=$logical" \
    --label "com.docker.compose.version=managed" \
    "$name" >/dev/null
  volume_contract "$project" "$logical" "$name" || die 'created volume ownership is incompatible'
}

require_secret_file() {
  local file=$1 mode=$2 uid=$3
  [[ -f $file && ! -L $file ]] || die 'required protected secret artifact is missing or unsafe'
  [[ $(stat -c '%u:%a' "$file") == "$uid:$mode" ]] \
    || die 'protected secret artifact ownership or mode is invalid'
}

require_secret_pair() {
  local source=$1 staged=$2 supplied=${3-}
  require_secret_file "$source" 600 "$(id -u)"
  require_secret_file "$staged" 400 1000
  cmp -s -- "$source" "$staged" || die 'source and staged credential continuity failed'
  if [[ -n $supplied ]]; then
    local installed
    installed=$(<"$source")
    [[ $supplied == "$installed" ]] || die 'supplied credential continuity failed'
    unset installed
  fi
}

validate_retained_credentials() {
  local root=$1
  require_secret_pair "$root/.install-secrets/postgres_admin_password" "$root/.container-secrets/admin_password" "${POSTGRES_ADMIN_PASSWORD:-}"
  require_secret_pair "$root/.install-secrets/migrator_password" "$root/.container-secrets/migrator_password" "${MIGRATOR_PASSWORD:-}"
  require_secret_pair "$root/.install-secrets/runtime_password" "$root/.container-secrets/runtime_password" "${RUNTIME_PASSWORD:-}"
  require_secret_pair "$root/.install-secrets/nautt_encryption_key" "$root/.container-secrets/nautt_encryption_key" "${NAUTT_ENCRYPTION_KEY:-}"
}

probe_database_role() {
  local project=$1 image=$2 role=$3 secret=$4
  docker run --rm --pull=never --network "${project}_database" --read-only --tmpfs /tmp \
    --volume "$secret:/run/probe-password:ro" "$image" \
    sh -eu -c 'PGPASSWORD=$(cat /run/probe-password); export PGPASSWORD; psql -h db -p 5433 -U "$1" -d qr_pagamentos -v ON_ERROR_STOP=1 -Atc "SELECT 1" >/dev/null' \
    -- "$role" >/dev/null 2>&1 || die 'retained database credential authentication failed'
}

validate_retained_database_roles() {
  local root=$1 project=$2 image=$3
  probe_database_role "$project" "$image" postgres "$root/.install-secrets/postgres_admin_password"
  probe_database_role "$project" "$image" qr_migrator "$root/.install-secrets/migrator_password"
  probe_database_role "$project" "$image" qr_runtime "$root/.install-secrets/runtime_password"
}

media_row_count() {
  local root=$1 project=$2 image=$3
  docker run --rm --pull=never --network "${project}_database" --read-only --tmpfs /tmp \
    --volume "$root/.install-secrets/runtime_password:/run/probe-password:ro" "$image" \
    sh -eu -c 'PGPASSWORD=$(cat /run/probe-password); export PGPASSWORD; psql -h db -p 5433 -U qr_runtime -d qr_pagamentos -Atc "SELECT count(*) FROM app.media_object" 2>/dev/null' \
    | tr -d '[:space:]'
}

ensure_media_volume() {
  local root=$1 project=$2 postgres_image=$3
  local db_name="${project}_postgres-data" media_name="${project}_media-data" rows
  if docker volume inspect "$media_name" >/dev/null 2>&1; then
    volume_contract "$project" media-data "$media_name" || die 'media volume ownership is incompatible'
    return
  fi
  volume_contract "$project" postgres-data "$db_name" || die 'PostgreSQL volume ownership is incompatible'
  rows=$(media_row_count "$root" "$project" "$postgres_image")
  [[ $rows == 0 ]] || die 'media volume is absent while media metadata exists'
  create_owned_volume "$project" media-data "$media_name"
  printf 'PASS legacy-media-volume-adopted\n'
}
