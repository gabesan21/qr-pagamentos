#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

fail() { printf 'FAIL install-contract: %s\n' "$*" >&2; exit 1; }
expect_contains() { grep -F -- "$2" "$1" >/dev/null || fail "missing expected text: $2"; }
expect_absent() { ! grep -F -- "$2" "$1" >/dev/null || fail "forbidden text present: $2"; }

cat > "$TMP/install.env" <<EOF
APP_PORT=33013
POSTGRES_ADMIN_PASSWORD=reserved-!:/?#[]@-admin
MIGRATOR_PASSWORD=reserved-!:/?#[]@-migrator
RUNTIME_PASSWORD=reserved-!:/?#[]@-runtime
EOF
chmod 0600 "$TMP/install.env"

output=$TMP/install.out
"$INSTALL_DIR/install.sh" --dry-run --env-file "$TMP/install.env" > "$output"
for expected in \
  'command -v docker' 'docker compose version' 'docker info' \
  'run --rm --network none --read-only' \
  'build --pull' 'up -d' '127.0.0.1:33013/api/health' '{"status":"ok"}' 'PASS install-complete'; do
  expect_contains "$output" "$expected"
done
expect_contains "$INSTALL_DIR/install.sh" 'chown 1000:1000'
expect_contains "$INSTALL_DIR/install.sh" 'chmod 0400'
expect_contains "$INSTALL_DIR/install.sh" '.install-secrets'
expect_absent "$output" 'reserved-!:/?#[]@-admin'
expect_absent "$output" 'sudo'
expect_absent "$INSTALL_DIR/install.sh" 'curl '
expect_absent "$INSTALL_DIR/install.sh" 'SUDO'
expect_absent "$INSTALL_DIR/uninstall.sh" 'SUDO'
git -C "$INSTALL_DIR/.." check-ignore -q install/.env || fail 'install/.env is not ignored by Git'

sed 's/^APP_PORT=.*/APP_PORT="33013"/' "$TMP/install.env" > "$TMP/quoted.env"
quoted_install_out=$TMP/install-quoted.out
quoted_uninstall_out=$TMP/uninstall-quoted.out
"$INSTALL_DIR/install.sh" --dry-run --env-file "$TMP/quoted.env" > "$quoted_install_out"
"$INSTALL_DIR/uninstall.sh" --dry-run --env-file "$TMP/quoted.env" > "$quoted_uninstall_out"
expect_contains "$quoted_install_out" '127.0.0.1:33013/api/health'
expect_contains "$quoted_uninstall_out" 'APP_PORT=33013'

sed 's/^APP_PORT=.*/APP_PORT=70000/' "$TMP/install.env" > "$TMP/invalid-port.env"
if "$INSTALL_DIR/uninstall.sh" --dry-run --env-file "$TMP/invalid-port.env" >/dev/null 2>&1; then fail 'invalid uninstall port succeeded'; fi

cp "$TMP/install.env" "$TMP/missing.env"
sed -i '/RUNTIME_PASSWORD=/d' "$TMP/missing.env"
if "$INSTALL_DIR/install.sh" --dry-run --env-file "$TMP/missing.env" >/dev/null 2>&1; then fail 'missing variable succeeded'; fi
sed 's|RUNTIME_PASSWORD=.*|RUNTIME_PASSWORD=reserved-!:/?#[]@-admin|' "$TMP/install.env" > "$TMP/duplicate.env"
chmod 0600 "$TMP/duplicate.env"
if "$INSTALL_DIR/install.sh" --dry-run --env-file "$TMP/duplicate.env" >/dev/null 2>&1; then fail 'duplicate passwords succeeded'; fi

default_out=$TMP/uninstall-default.out
purge_out=$TMP/uninstall-purge.out
"$INSTALL_DIR/uninstall.sh" --dry-run --env-file "$TMP/install.env" > "$default_out"
"$INSTALL_DIR/uninstall.sh" --dry-run --purge-data --env-file "$TMP/install.env" > "$purge_out"
expect_contains "$default_out" 'down --remove-orphans'
expect_contains "$default_out" '.install-secrets'
expect_absent "$default_out" '--volumes'
expect_absent "$default_out" 'apt-get purge'
expect_contains "$purge_out" '--volumes'
expect_absent "$purge_out" 'apt-get purge'

for script in "$INSTALL_DIR/install.sh" "$INSTALL_DIR/uninstall.sh" "$INSTALL_DIR/test.sh"; do
  [[ -x $script ]] || fail "not executable: $script"
done
printf 'PASS install-contract\n'
