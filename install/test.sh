#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
export INSTALL_ARCHITECTURE=amd64

fail() { printf 'FAIL install-contract: %s\n' "$*" >&2; exit 1; }
expect_contains() { grep -F -- "$2" "$1" >/dev/null || fail "missing expected text: $2"; }
expect_absent() { ! grep -F -- "$2" "$1" >/dev/null || fail "forbidden text present: $2"; }

cat > "$TMP/os-release" <<'EOF'
ID=debian
VERSION_CODENAME=bookworm
EOF
cat > "$TMP/os-release-ubuntu" <<'EOF'
ID=ubuntu
VERSION_CODENAME=noble
EOF
for name in admin migrator runtime; do
  printf 'reserved-!:/?#[]@-%s\n' "$name" > "$TMP/$name"
  chmod 0600 "$TMP/$name"
done
cat > "$TMP/install.env" <<EOF
APP_PORT=33013
POSTGRES_ADMIN_PASSWORD_FILE=$TMP/admin
MIGRATOR_PASSWORD_FILE=$TMP/migrator
RUNTIME_PASSWORD_FILE=$TMP/runtime
EOF

output=$TMP/install.out
"$INSTALL_DIR/install.sh" --dry-run --os-release "$TMP/os-release" --env-file "$TMP/install.env" > "$output"
for expected in \
  'https://download.docker.com/linux/debian' \
  'docker-ce' 'docker-ce-cli' 'containerd.io' 'docker-buildx-plugin' 'docker-compose-plugin' \
  'run --rm --network none --read-only' \
  'build --pull' 'up -d' '127.0.0.1:33013/api/health' '{"status":"ok"}' 'PASS install-complete'; do
  expect_contains "$output" "$expected"
done
expect_contains "$INSTALL_DIR/install.sh" 'chown 1000:1000'
expect_contains "$INSTALL_DIR/install.sh" 'chmod 0400'
expect_absent "$output" 'reserved-!:/?#[]@-admin'
"$INSTALL_DIR/install.sh" --dry-run --os-release "$TMP/os-release-ubuntu" --env-file "$TMP/install.env" > "$TMP/ubuntu.out"
expect_contains "$TMP/ubuntu.out" 'https://download.docker.com/linux/ubuntu'

cp "$TMP/install.env" "$TMP/missing.env"
sed -i '/RUNTIME_PASSWORD_FILE/d' "$TMP/missing.env"
if "$INSTALL_DIR/install.sh" --dry-run --os-release "$TMP/os-release" --env-file "$TMP/missing.env" >/dev/null 2>&1; then fail 'missing variable succeeded'; fi
printf 'POSTGRES_ADMIN_PASSWORD=plaintext\n' >> "$TMP/install.env"
if "$INSTALL_DIR/install.sh" --dry-run --os-release "$TMP/os-release" --env-file "$TMP/install.env" >/dev/null 2>&1; then fail 'plaintext password variable succeeded'; fi
sed -i '$d' "$TMP/install.env"
chmod 0644 "$TMP/runtime"
if "$INSTALL_DIR/install.sh" --dry-run --os-release "$TMP/os-release" --env-file "$TMP/install.env" >/dev/null 2>&1; then fail 'mode-0644 secret succeeded'; fi
chmod 0600 "$TMP/runtime"
sed "s|RUNTIME_PASSWORD_FILE=.*|RUNTIME_PASSWORD_FILE=relative-secret|" "$TMP/install.env" > "$TMP/relative.env"
if "$INSTALL_DIR/install.sh" --dry-run --os-release "$TMP/os-release" --env-file "$TMP/relative.env" >/dev/null 2>&1; then fail 'relative secret path succeeded'; fi

default_out=$TMP/uninstall-default.out
purge_out=$TMP/uninstall-purge.out
docker_out=$TMP/uninstall-docker.out
"$INSTALL_DIR/uninstall.sh" --dry-run --env-file "$TMP/install.env" > "$default_out"
"$INSTALL_DIR/uninstall.sh" --dry-run --purge-data --env-file "$TMP/install.env" > "$purge_out"
"$INSTALL_DIR/uninstall.sh" --dry-run --remove-docker --env-file "$TMP/install.env" > "$docker_out"
expect_contains "$default_out" 'down --remove-orphans'
expect_absent "$default_out" '--volumes'
expect_absent "$default_out" 'apt-get purge'
expect_contains "$purge_out" '--volumes'
expect_absent "$purge_out" 'apt-get purge'
expect_contains "$docker_out" 'apt-get purge -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin'
expect_absent "$docker_out" '--volumes'

for script in "$INSTALL_DIR/install.sh" "$INSTALL_DIR/uninstall.sh" "$INSTALL_DIR/test.sh"; do
  [[ -x $script ]] || fail "not executable: $script"
done
printf 'PASS install-contract\n'
