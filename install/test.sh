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
INITIAL_ADMIN_USERNAME=Admin.User
INITIAL_ADMIN_EMAIL=Admin.Example+ops@Example.COM
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
expect_absent "$output" 'Admin.Example+ops@Example.COM'
expect_absent "$output" 'Admin.User'
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
sed '/INITIAL_ADMIN_USERNAME=/d' "$TMP/install.env" > "$TMP/missing-username.env"
if "$INSTALL_DIR/install.sh" --dry-run --env-file "$TMP/missing-username.env" >/dev/null 2>&1; then fail 'missing username succeeded'; fi
sed 's/^INITIAL_ADMIN_USERNAME=.*/INITIAL_ADMIN_USERNAME=/' "$TMP/install.env" > "$TMP/blank-username.env"
if "$INSTALL_DIR/install.sh" --dry-run --env-file "$TMP/blank-username.env" >/dev/null 2>&1; then fail 'blank username succeeded'; fi
sed '/INITIAL_ADMIN_EMAIL=/d' "$TMP/install.env" > "$TMP/absent-email.env"
"$INSTALL_DIR/install.sh" --dry-run --env-file "$TMP/absent-email.env" >/dev/null || fail 'absent optional email failed'
sed 's|RUNTIME_PASSWORD=.*|RUNTIME_PASSWORD=reserved-!:/?#[]@-admin|' "$TMP/install.env" > "$TMP/duplicate.env"
chmod 0600 "$TMP/duplicate.env"
if "$INSTALL_DIR/install.sh" --dry-run --env-file "$TMP/duplicate.env" >/dev/null 2>&1; then fail 'duplicate passwords succeeded'; fi

nul_env=$TMP/nul.env
printf 'APP_PORT=33013\nINITIAL_ADMIN_USERNAME=admin\nINITIAL_ADMIN_EMAIL=admin@example.com\0ignored\nPOSTGRES_ADMIN_PASSWORD=admin-secret\nMIGRATOR_PASSWORD=migrator-secret\nRUNTIME_PASSWORD=runtime-secret\n' > "$nul_env"
chmod 0600 "$nul_env"
if "$INSTALL_DIR/install.sh" --dry-run --env-file "$nul_env" >/dev/null 2>&1; then fail 'NUL-bearing environment file succeeded'; fi

identity_dir=$TMP/identity
printf '%s\n%s' ' Admin.User ' ' Admin.Example+ops@Example.COM ' | node "$INSTALL_DIR/../container/prepare-identity-secrets.mjs" "$identity_dir"
[[ $(cat "$identity_dir/initial_admin_username") == 'admin.user' ]] || fail 'username was not canonicalized'
[[ $(cat "$identity_dir/initial_admin_email") == 'admin.example+ops@example.com' ]] || fail 'email was not canonicalized'
[[ $(wc -c < "$identity_dir/initial_admin_email") == 30 ]] || fail 'canonical email file format changed'
[[ $(cat "$identity_dir/initial_admin_password") =~ ^[A-Za-z0-9_-]{32}$ ]] || fail 'generated initial password format changed'
[[ $(stat -c '%a' "$identity_dir/initial_admin_username") == 600 && $(stat -c '%a' "$identity_dir/initial_admin_email") == 600 && $(stat -c '%a' "$identity_dir/initial_admin_password") == 600 ]] || fail 'identity source mode changed'
initial_password=$(cat "$identity_dir/initial_admin_password")
printf '%s\n%s' 'admin' '' | node "$INSTALL_DIR/../container/prepare-identity-secrets.mjs" "$identity_dir"
[[ $(wc -c < "$identity_dir/initial_admin_email") == 0 ]] || fail 'absent email marker is not zero-byte'
[[ $(cat "$identity_dir/initial_admin_password") == "$initial_password" ]] || fail 'initial password was not reused'
node "$INSTALL_DIR/../container/prepare-identity-secrets.mjs" "$identity_dir" --recovery
recovery_password=$(cat "$identity_dir/initial_admin_recovery_password")
[[ $recovery_password =~ ^[A-Za-z0-9_-]{32}$ && $recovery_password != "$initial_password" ]] || fail 'recovery candidate format/distinctness changed'
node "$INSTALL_DIR/../container/prepare-identity-secrets.mjs" "$identity_dir" --recovery
[[ $(cat "$identity_dir/initial_admin_recovery_password") == "$recovery_password" ]] || fail 'recovery candidate was not retry-stable'
for invalid_username in 'ab' '.admin' 'admin..user' 'admin@example.com' 'usuário'; do
  if printf '%s\n%s' "$invalid_username" '' | node "$INSTALL_DIR/../container/prepare-identity-secrets.mjs" "$TMP/invalid-identity" >/dev/null 2>&1; then fail "invalid username succeeded"; fi
  rm -rf "$TMP/invalid-identity"
done
for invalid_email in 'a@example' 'a@@example.com' 'á@example.com' 'a @example.com'; do
  if printf '%s\n%s' 'admin' "$invalid_email" | node "$INSTALL_DIR/../container/prepare-identity-secrets.mjs" "$TMP/invalid-identity" >/dev/null 2>&1; then fail "invalid email succeeded"; fi
  rm -rf "$TMP/invalid-identity"
done

recovery_out=$TMP/recovery.out
"$INSTALL_DIR/install.sh" --dry-run --recover-initial-admin --env-file "$TMP/install.env" > "$recovery_out"
for expected in 'compose.recovery.yaml' 'run --rm --no-deps identity-recovery' 'initial_admin_recovery_password' 'PASS initial-admin-recovered'; do expect_contains "$recovery_out" "$expected"; done
expect_absent "$recovery_out" 'reserved-!:/?#[]@-admin'

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

sed '/^INITIAL_ADMIN_\(USERNAME\|EMAIL\)=/d' "$TMP/install.env" > "$TMP/uninstall.env"
"$INSTALL_DIR/uninstall.sh" --dry-run --env-file "$TMP/uninstall.env" >/dev/null \
  || fail 'default uninstall required install-only identity variables'
"$INSTALL_DIR/uninstall.sh" --dry-run --purge-data --env-file "$TMP/uninstall.env" >/dev/null \
  || fail 'purge uninstall required install-only identity variables'

for script in "$INSTALL_DIR/install.sh" "$INSTALL_DIR/uninstall.sh" "$INSTALL_DIR/test.sh"; do
  [[ -x $script ]] || fail "not executable: $script"
done
printf 'PASS install-contract\n'
