#!/usr/bin/env sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
postgres_password_file="$project_dir/.install-secrets/postgres_admin_password"
staged_secrets_dir="$project_dir/.container-secrets"

app_port=${APP_PORT:-}
if [ -z "$app_port" ]; then
  published_address=$(docker port qr-pagamentos-app-1 3000/tcp 2>/dev/null | sed -n '1p' || true)
  app_port=${published_address##*:}
fi

if [ ! -r "$postgres_password_file" ]; then
  printf '%s\n' "Missing PostgreSQL password file: $postgres_password_file" >&2
  exit 1
fi

if [ ! -r "$staged_secrets_dir/runtime_password" ]; then
  printf '%s\n' "Missing staged runtime password: $staged_secrets_dir/runtime_password" >&2
  exit 1
fi

case "$app_port" in
  ''|*[!0-9]*|0)
    printf '%s\n' "Unable to determine the installed app port. Run with APP_PORT=<port>." >&2
    exit 1
    ;;
esac

cd "$project_dir"
POSTGRES_ADMIN_PASSWORD_FILE="$postgres_password_file" \
  STAGED_SECRETS_DIR="$staged_secrets_dir" \
  APP_PORT="$app_port" \
  exec docker compose up -d --build --no-deps app
