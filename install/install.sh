#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENV_FILE="$ROOT_DIR/install/.env.install"
OS_RELEASE_FILE=/etc/os-release
DRY_RUN=false
NODE_HELPER='node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d'
DOCKER_PACKAGES=(docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin)

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
print_command() { printf 'DRY-RUN'; printf ' %q' "$@"; printf '\n'; }
run() { if "$DRY_RUN"; then print_command "$@"; else "$@"; fi; }

while (($#)); do
  case "$1" in
    --env-file) (($# >= 2)) || die '--env-file requires a path'; ENV_FILE=$2; shift 2 ;;
    --os-release) (($# >= 2)) || die '--os-release requires a path'; OS_RELEASE_FILE=$2; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done
if [[ $OS_RELEASE_FILE != /etc/os-release ]] && ! "$DRY_RUN"; then
  die '--os-release is available only with --dry-run'
fi

strip_quotes() {
  local value=$1
  if [[ $value == \"*\" && $value == *\" ]] || [[ $value == \'*\' && $value == *\' ]]; then
    value=${value:1:${#value}-2}
  fi
  printf '%s' "$value"
}

load_install_env() {
  [[ -f $ENV_FILE ]] || die "copy install/.env.install.example to install/.env.install first"
  local line key value
  while IFS= read -r line || [[ -n $line ]]; do
    line=${line%$'\r'}
    [[ -z $line || $line == \#* ]] && continue
    [[ $line == *=* ]] || die "invalid line in $ENV_FILE"
    key=${line%%=*}
    value=$(strip_quotes "${line#*=}")
    case "$key" in
      APP_PORT|POSTGRES_ADMIN_PASSWORD_FILE|MIGRATOR_PASSWORD_FILE|RUNTIME_PASSWORD_FILE)
        printf -v "$key" '%s' "$value" ;;
      *) die "unsupported variable in $ENV_FILE: $key" ;;
    esac
  done < "$ENV_FILE"
  for key in APP_PORT POSTGRES_ADMIN_PASSWORD_FILE MIGRATOR_PASSWORD_FILE RUNTIME_PASSWORD_FILE; do
    [[ -n ${!key:-} ]] || die "required variable is missing: $key"
  done
  [[ $APP_PORT =~ ^[1-9][0-9]{0,4}$ ]] && ((10#$APP_PORT <= 65535)) || die 'APP_PORT must be between 1 and 65535'
}

load_os_release() {
  [[ -f $OS_RELEASE_FILE ]] || die "missing OS release file: $OS_RELEASE_FILE"
  local line key value
  OS_ID= OS_CODENAME=
  while IFS= read -r line || [[ -n $line ]]; do
    [[ $line == *=* ]] || continue
    key=${line%%=*}; value=$(strip_quotes "${line#*=}")
    case "$key" in ID) OS_ID=$value ;; VERSION_CODENAME) OS_CODENAME=$value ;; esac
  done < "$OS_RELEASE_FILE"
  [[ $OS_ID == debian || $OS_ID == ubuntu ]] || die "unsupported operating system: ${OS_ID:-unknown}"
  [[ $OS_CODENAME =~ ^[a-z0-9._-]+$ ]] || die 'VERSION_CODENAME is missing or invalid'
}

select_privilege() {
  if ((EUID == 0)); then
    SUDO=()
  elif "$DRY_RUN"; then
    SUDO=(sudo)
  else
    command -v sudo >/dev/null || die 'sudo is required when not running as root'
    SUDO=(sudo)
  fi
  OPERATOR_UID=${SUDO_UID:-$(id -u)}
  OPERATOR_GID=${SUDO_GID:-$(id -g)}
}

validate_secret() {
  local label=$1 source=$2 owner mode
  [[ $source == /* && $source != *:* && $source != *$'\n'* ]] || die "$label must be an absolute Docker-safe path"
  [[ -f $source && ! -L $source ]] || die "$label must reference a regular file"
  owner=$(stat -c '%u' "$source"); mode=$(stat -c '%a' "$source")
  [[ $owner == "$OPERATOR_UID" && $mode == 600 ]] || die "$label must be invoking-user-owned with mode 0600"
}

install_docker() {
  local architecture key_tmp source_tmp
  run "${SUDO[@]}" apt-get update
  run "${SUDO[@]}" apt-get install -y ca-certificates curl
  if "$DRY_RUN" && [[ -n ${INSTALL_ARCHITECTURE:-} ]]; then architecture=$INSTALL_ARCHITECTURE; else architecture=$(dpkg --print-architecture); fi
  [[ $architecture =~ ^[a-z0-9._-]+$ ]] || die 'Docker APT architecture is invalid'
  if "$DRY_RUN"; then
    print_command curl -fsSL "https://download.docker.com/linux/$OS_ID/gpg" -o /tmp/qr-docker.asc
    print_command "${SUDO[@]}" install -d -m 0755 /etc/apt/keyrings
    print_command "${SUDO[@]}" install -m 0644 /tmp/qr-docker.asc /etc/apt/keyrings/docker.asc
    printf 'DRY-RUN repository deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable\n' "$architecture" "$OS_ID" "$OS_CODENAME"
    print_command "${SUDO[@]}" install -m 0644 /tmp/qr-docker.list /etc/apt/sources.list.d/docker.list
  else
    key_tmp=$(mktemp); source_tmp=$(mktemp)
    trap 'rm -f "${key_tmp:-}" "${source_tmp:-}"' RETURN
    curl -fsSL "https://download.docker.com/linux/$OS_ID/gpg" -o "$key_tmp"
    "${SUDO[@]}" install -d -m 0755 /etc/apt/keyrings
    "${SUDO[@]}" install -m 0644 "$key_tmp" /etc/apt/keyrings/docker.asc
    printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable\n' "$architecture" "$OS_ID" "$OS_CODENAME" > "$source_tmp"
    "${SUDO[@]}" install -m 0644 "$source_tmp" /etc/apt/sources.list.d/docker.list
    rm -f "$key_tmp" "$source_tmp"; trap - RETURN
  fi
  run "${SUDO[@]}" apt-get update
  run "${SUDO[@]}" apt-get install -y "${DOCKER_PACKAGES[@]}"
}

select_docker() {
  if "$DRY_RUN" || docker info >/dev/null 2>&1; then
    DOCKER=(docker)
  elif "${SUDO[@]}" docker info >/dev/null 2>&1; then
    DOCKER=("${SUDO[@]}" docker)
  else
    run "${SUDO[@]}" systemctl enable --now docker
    "${SUDO[@]}" docker info >/dev/null 2>&1 || die 'Docker daemon is unavailable'
    DOCKER=("${SUDO[@]}" docker)
  fi
}

stage_secrets() {
  local staged=$ROOT_DIR/.container-secrets variable source target actual
  run "${SUDO[@]}" install -d -m 0700 -o "$OPERATOR_UID" -g "$OPERATOR_GID" "$staged"
  for entry in \
    "POSTGRES_ADMIN_PASSWORD_FILE:admin_password" \
    "MIGRATOR_PASSWORD_FILE:migrator_password" \
    "RUNTIME_PASSWORD_FILE:runtime_password"; do
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
  STAGED_SECRETS_DIR=$staged
}

compose() {
  APP_PORT=$APP_PORT POSTGRES_ADMIN_PASSWORD_FILE=$POSTGRES_ADMIN_PASSWORD_FILE \
    MIGRATOR_PASSWORD_FILE=$MIGRATOR_PASSWORD_FILE RUNTIME_PASSWORD_FILE=$RUNTIME_PASSWORD_FILE \
    STAGED_SECRETS_DIR=$STAGED_SECRETS_DIR "${DOCKER[@]}" compose -f "$ROOT_DIR/compose.yaml" -p qr-pagamentos "$@"
}

deploy() {
  if "$DRY_RUN"; then
    print_command docker compose -f "$ROOT_DIR/compose.yaml" -p qr-pagamentos build --pull
    print_command docker compose -f "$ROOT_DIR/compose.yaml" -p qr-pagamentos up -d
    printf 'DRY-RUN wait for exact http://127.0.0.1:%s/api/health = {"status":"ok"}\n' "$APP_PORT"
    return
  fi
  compose build --pull
  compose up -d
  local attempt body
  for attempt in {1..120}; do
    body=$(curl --fail --silent --show-error --max-time 3 "http://127.0.0.1:$APP_PORT/api/health" 2>/dev/null || true)
    [[ $body == '{"status":"ok"}' ]] && { printf 'PASS install-health\n'; return; }
    sleep 1
  done
  compose ps >&2 || true
  compose logs --no-color app >&2 || true
  die 'application did not return the exact health response within 120 seconds'
}

load_install_env
load_os_release
select_privilege
validate_secret POSTGRES_ADMIN_PASSWORD_FILE "$POSTGRES_ADMIN_PASSWORD_FILE"
validate_secret MIGRATOR_PASSWORD_FILE "$MIGRATOR_PASSWORD_FILE"
validate_secret RUNTIME_PASSWORD_FILE "$RUNTIME_PASSWORD_FILE"
cmp -s "$POSTGRES_ADMIN_PASSWORD_FILE" "$MIGRATOR_PASSWORD_FILE" && die 'password files must be distinct'
cmp -s "$POSTGRES_ADMIN_PASSWORD_FILE" "$RUNTIME_PASSWORD_FILE" && die 'password files must be distinct'
cmp -s "$MIGRATOR_PASSWORD_FILE" "$RUNTIME_PASSWORD_FILE" && die 'password files must be distinct'
install_docker
select_docker
stage_secrets
deploy
printf 'PASS install-complete\n'
