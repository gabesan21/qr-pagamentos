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
NAUTT_WEBHOOK_CALLBACK_URL=https://payments.example.com/api/nautt/webhooks
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
expect_contains "$INSTALL_DIR/install.sh" 'POSTGRES_PORT=5433'
expect_contains "$INSTALL_DIR/../compose.yaml" 'command: ["postgres", "-p", "${POSTGRES_PORT:-5433}"]'
expect_contains "$INSTALL_DIR/../compose.yaml" 'POSTGRES_PORT: ${POSTGRES_PORT:-5433}'
expect_absent "$output" 'reserved-!:/?#[]@-admin'
expect_absent "$output" 'sudo'
expect_absent "$output" 'Admin.Example+ops@Example.COM'
expect_absent "$output" 'Admin.User'
expect_absent "$INSTALL_DIR/install.sh" 'curl '
expect_absent "$INSTALL_DIR/install.sh" 'SUDO'
expect_absent "$INSTALL_DIR/uninstall.sh" 'SUDO'

# Nautt encryption key generation/validation path
expect_contains "$INSTALL_DIR/install.sh" 'NAUTT_ENCRYPTION_KEY'
expect_contains "$output" 'nautt_encryption_key'
valid_nautt_key=$(node -e 'process.stdout.write(crypto.randomBytes(32).toString("base64url"))')
[[ ${#valid_nautt_key} -ge 32 ]] || fail 'generated Nautt key is unexpectedly short'
node -e 'process.exit(Buffer.from(process.argv[1], "base64url").length === 32 ? 0 : 1)' "$valid_nautt_key" || fail 'valid Nautt key length check failed'
node -e 'process.exit(Buffer.from(process.argv[1], "base64url").length === 32 ? 0 : 1)' 'aG9zdA' && fail 'invalid Nautt key length check succeeded' || true
cat > "$TMP/nautt-valid.env" <<EOF
APP_PORT=33013
INITIAL_ADMIN_USERNAME=Admin.User
INITIAL_ADMIN_EMAIL=
POSTGRES_ADMIN_PASSWORD=reserved-!:/?#[]@-admin
MIGRATOR_PASSWORD=reserved-!:/?#[]@-migrator
RUNTIME_PASSWORD=reserved-!:/?#[]@-runtime
NAUTT_ENCRYPTION_KEY=$valid_nautt_key
NAUTT_WEBHOOK_CALLBACK_URL=https://payments.example.com/api/nautt/webhooks
EOF
chmod 0600 "$TMP/nautt-valid.env"
nautt_valid_out=$TMP/nautt-valid.out
"$INSTALL_DIR/install.sh" --dry-run --env-file "$TMP/nautt-valid.env" > "$nautt_valid_out"
expect_contains "$nautt_valid_out" 'nautt_encryption_key'
expect_absent "$nautt_valid_out" "$valid_nautt_key"
sed 's|^NAUTT_WEBHOOK_CALLBACK_URL=.*|NAUTT_WEBHOOK_CALLBACK_URL=http://payments.example/webhook|' "$TMP/install.env" > "$TMP/invalid-callback.env"
if "$INSTALL_DIR/install.sh" --dry-run --env-file "$TMP/invalid-callback.env" >/dev/null 2>&1; then fail 'invalid Nautt callback succeeded'; fi
sed '/^NAUTT_WEBHOOK_CALLBACK_URL=/d' "$TMP/install.env" > "$TMP/missing-callback.env"
if "$INSTALL_DIR/install.sh" --dry-run --env-file "$TMP/missing-callback.env" >/dev/null 2>&1; then fail 'missing Nautt callback succeeded'; fi

# Optional Nautt API base URL override path
expect_contains "$INSTALL_DIR/install.sh" 'NAUTT_API_BASE_URL'
expect_contains "$INSTALL_DIR/.env.example" 'NAUTT_API_BASE_URL'
sed '$a NAUTT_API_BASE_URL=https://api-stage.nauttfinance.com/api/v2' "$TMP/install.env" > "$TMP/base-url.env"
"$INSTALL_DIR/install.sh" --dry-run --env-file "$TMP/base-url.env" >/dev/null || fail 'valid Nautt API base URL override failed'
"$INSTALL_DIR/uninstall.sh" --dry-run --env-file "$TMP/base-url.env" >/dev/null || fail 'uninstall rejected the optional Nautt API base URL'
sed '$a NAUTT_API_BASE_URL=http://api-stage.nauttfinance.com/api/v2' "$TMP/install.env" > "$TMP/invalid-base-url.env"
if "$INSTALL_DIR/install.sh" --dry-run --env-file "$TMP/invalid-base-url.env" >/dev/null 2>&1; then fail 'invalid Nautt API base URL succeeded'; fi

git -C "$INSTALL_DIR/.." check-ignore -q install/.env || fail 'install/.env is not ignored by Git'
git -C "$INSTALL_DIR/.." check-ignore -q .update-evidence/ || fail '.update-evidence is not ignored by Git'

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

for script in "$INSTALL_DIR/install.sh" "$INSTALL_DIR/update.sh" "$INSTALL_DIR/uninstall.sh" "$INSTALL_DIR/test.sh"; do
  [[ -x $script ]] || fail "not executable: $script"
done

# Dedicated update command: deterministic ownership, continuity, evidence, and failure contracts.
update_root=$TMP/update-root
mkdir -p "$update_root/install" "$update_root/prisma/migrations/20260722000000_fixture" "$update_root/bin"
cp "$INSTALL_DIR/update.sh" "$update_root/install/update.sh"
cp "$INSTALL_DIR/../compose.yaml" "$update_root/compose.yaml"
printf '%s\n' 'SELECT 1;' > "$update_root/prisma/migrations/20260722000000_fixture/migration.sql"
git -C "$update_root" init -q
git -C "$update_root" config user.email test@example.invalid
git -C "$update_root" config user.name 'Contract Test'
git -C "$update_root" add compose.yaml prisma install/update.sh
git -C "$update_root" commit -qm fixture

update_key=$(node -e 'process.stdout.write(Buffer.alloc(32, 7).toString("base64url"))')
mkdir -m 0700 "$update_root/.install-secrets" "$update_root/.container-secrets"
for secret in postgres_admin_password migrator_password runtime_password initial_admin_username initial_admin_email initial_admin_password; do
  printf '%s' "source-$secret" > "$update_root/.install-secrets/$secret"
  chmod 0600 "$update_root/.install-secrets/$secret"
done
printf '%s' "$update_key" > "$update_root/.install-secrets/nautt_encryption_key"
chmod 0600 "$update_root/.install-secrets/nautt_encryption_key"
for secret in admin_password migrator_password runtime_password initial_admin_username initial_admin_email initial_admin_password; do
  printf '%s' "staged-$secret" > "$update_root/.container-secrets/$secret"
  chmod 0400 "$update_root/.container-secrets/$secret"
done
printf '%s' "$update_key" > "$update_root/.container-secrets/nautt_encryption_key"
chmod 0400 "$update_root/.container-secrets/nautt_encryption_key"

cat > "$update_root/install/update.env" <<EOF
APP_PORT=33013
INITIAL_ADMIN_USERNAME=Admin.User
INITIAL_ADMIN_EMAIL=ops@example.invalid
POSTGRES_ADMIN_PASSWORD=update-admin-sentinel
MIGRATOR_PASSWORD=update-migrator-sentinel
RUNTIME_PASSWORD=update-runtime-sentinel
NAUTT_ENCRYPTION_KEY=$update_key
NAUTT_WEBHOOK_CALLBACK_URL=https://payments.example.com/api/nautt/webhooks
EOF
chmod 0600 "$update_root/install/update.env"

cat > "$update_root/bin/docker" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >> "$FAKE_DOCKER_LOG"
if [[ $1 == info ]]; then exit 0; fi
if [[ $1 == volume && $2 == inspect ]]; then
  [[ ${FAKE_VOLUME_MISSING:-false} == true ]] && exit 1
  if [[ $4 == *Mountpoint* ]]; then
    printf '%s\n' "${FAKE_VOLUME_IDENTITY:-qr-pagamentos_postgres-data|/var/lib/docker/volumes/fixture|2026-07-22T18:00:00Z}"
  else
    printf '%s\n' "${FAKE_VOLUME_METADATA:-local|qr-pagamentos|postgres-data|qr-pagamentos_postgres-data}"
  fi
  exit 0
fi
if [[ $1 == inspect ]]; then
  format=$3; id=$4
  if [[ $format == *com.docker.compose.project* ]]; then
    printf '%s\n' "${FAKE_CONTAINER_METADATA:-qr-pagamentos|db}"
  elif [[ $format == *'.Mounts'* ]]; then
    printf '%s\n' "${FAKE_MOUNTS:-qr-pagamentos_postgres-data|/var/lib/postgresql}"
  elif [[ $format == *'.Image'* ]]; then
    printf 'sha256:image-%s\n' "$id"
  elif [[ $format == *'.State.ExitCode'* ]]; then
    printf '0\n'
  else
    exit 96
  fi
  exit 0
fi
[[ $1 == compose ]] || exit 95
shift
if [[ $1 == version ]]; then printf '5.3.1\n'; exit 0; fi
while (($#)); do
  case "$1" in -f|-p) shift 2 ;; *) break ;; esac
done
case "$1" in
  ps)
    service=${@: -1}
    if [[ $service == db && ${FAKE_DB_MISSING:-false} == true ]]; then exit 0; fi
    printf '%s-id\n' "$service" ;;
  config) printf '%s\n' 'redacted-compose-configuration' ;;
  build) if [[ ${FAKE_BUILD_FAIL:-false} == true ]]; then exit 42; fi ;;
  up) : ;;
  logs) printf '%s\n' 'PASS runtime-db-preflight' ;;
  exec) : ;;
  *) exit 94 ;;
esac
EOF
chmod 0700 "$update_root/bin/docker"
update_log=$TMP/update-docker.log
update_out=$TMP/update.out
update_env=(PATH="$update_root/bin:$PATH" FAKE_DOCKER_LOG="$update_log")
update_args=(--env-file "$update_root/install/update.env" --backup-reference backup-2026-07-22T1800Z --previous-release release-v1)
if ! env "${update_env[@]}" "$update_root/install/update.sh" "${update_args[@]}" > "$update_out" 2>&1; then
  cat "$update_out" >&2
  fail 'valid guarded update failed'
fi
expect_contains "$update_out" 'PASS update-evidence'
expect_contains "$update_out" 'PASS update-complete'
expect_absent "$update_out" "$update_key"
expect_absent "$update_out" 'update-admin-sentinel'
evidence_file=$(find "$update_root/.update-evidence" -maxdepth 1 -name 'update-*.txt' -type f)
[[ -n $evidence_file && $(stat -c '%a' "$evidence_file") == 400 ]] || fail 'protected update evidence was not created'
[[ $(stat -c '%a' "$update_root/.update-evidence") == 700 ]] || fail 'update evidence directory mode changed'
for field in format captured_at previous_release backup_reference target_git_revision target_git_state compose_project compose_version volume_name volume_identity database_container_id configuration_sha256 migration_set_sha256; do
  expect_contains "$evidence_file" "$field="
done
expect_contains "$evidence_file" 'migrations_begin'
expect_contains "$evidence_file" 'images_begin'
expect_absent "$evidence_file" "$update_key"
expect_absent "$evidence_file" '.install-secrets'
build_line=$(grep -n 'build --pull' "$update_log" | head -1 | cut -d: -f1)
[[ -n $build_line && -f $evidence_file ]] || fail 'build/evidence ordering is not observable'

dry_out=$TMP/update-dry.out
"$update_root/install/update.sh" "${update_args[@]}" --dry-run > "$dry_out"
for expected in 'validate existing protected' 'volume inspect' 'build --pull' 'up -d' 'healthcheck.mjs' 'unchanged-volume-identity' 'PASS update-dry-run'; do
  expect_contains "$dry_out" "$expected"
done
expect_absent "$dry_out" "$update_key"

expect_refusal() {
  local label=$1; shift
  : > "$update_log"
  if env "${update_env[@]}" "$@" "$update_root/install/update.sh" "${update_args[@]}" >/dev/null 2>&1; then
    fail "update refusal succeeded: $label"
  fi
  expect_absent "$update_log" 'build --pull'
  expect_absent "$update_log" 'up -d'
}
expect_refusal missing-volume FAKE_VOLUME_MISSING=true
expect_refusal unlabeled-volume 'FAKE_VOLUME_METADATA=local|||qr-pagamentos_postgres-data'
expect_refusal foreign-volume 'FAKE_VOLUME_METADATA=local|foreign|postgres-data|qr-pagamentos_postgres-data'
expect_refusal wrong-logical-volume 'FAKE_VOLUME_METADATA=local|qr-pagamentos|other|qr-pagamentos_postgres-data'
expect_refusal wrong-driver 'FAKE_VOLUME_METADATA=nfs|qr-pagamentos|postgres-data|qr-pagamentos_postgres-data'
expect_refusal missing-db FAKE_DB_MISSING=true
expect_refusal foreign-db 'FAKE_CONTAINER_METADATA=foreign|db'
expect_refusal wrong-mount-source 'FAKE_MOUNTS=foreign-volume|/var/lib/postgresql'
expect_refusal wrong-mount-destination 'FAKE_MOUNTS=qr-pagamentos_postgres-data|/var/lib/postgresql/data'

mv "$update_root/.container-secrets/nautt_encryption_key" "$update_root/.container-secrets/nautt_encryption_key.saved"
expect_refusal missing-staged-key
mv "$update_root/.container-secrets/nautt_encryption_key.saved" "$update_root/.container-secrets/nautt_encryption_key"
chmod 0644 "$update_root/.install-secrets/nautt_encryption_key"
expect_refusal unsafe-source-key-mode
chmod 0600 "$update_root/.install-secrets/nautt_encryption_key"
printf '%s' "${update_key%?}B" > "$update_root/.install-secrets/nautt_encryption_key"
expect_refusal invalid-source-key
printf '%s' "$update_key" > "$update_root/.install-secrets/nautt_encryption_key"
chmod 0600 "$update_root/.container-secrets/nautt_encryption_key"
printf '%s' "${update_key%?}A" > "$update_root/.container-secrets/nautt_encryption_key"
chmod 0400 "$update_root/.container-secrets/nautt_encryption_key"
expect_refusal mismatched-staged-key
chmod 0600 "$update_root/.container-secrets/nautt_encryption_key"
printf '%s' "$update_key" > "$update_root/.container-secrets/nautt_encryption_key"
chmod 0400 "$update_root/.container-secrets/nautt_encryption_key"

other_update_key=$(node -e 'process.stdout.write(Buffer.alloc(32, 8).toString("base64url"))')
sed "s|^NAUTT_ENCRYPTION_KEY=.*|NAUTT_ENCRYPTION_KEY=$other_update_key|" "$update_root/install/update.env" > "$update_root/install/mismatched.env"
chmod 0600 "$update_root/install/mismatched.env"
: > "$update_log"
if env "${update_env[@]}" "$update_root/install/update.sh" --env-file "$update_root/install/mismatched.env" --backup-reference backup-v1 --previous-release release-v1 >/dev/null 2>&1; then
  fail 'mismatched environment Nautt key succeeded'
fi
expect_absent "$update_log" 'build --pull'

: > "$update_log"
before_failure=$(find "$update_root/.update-evidence" -type f | wc -l)
if env "${update_env[@]}" FAKE_BUILD_FAIL=true "$update_root/install/update.sh" "${update_args[@]}" >/dev/null 2>&1; then
  fail 'forced update build failure succeeded'
fi
after_failure=$(find "$update_root/.update-evidence" -type f | wc -l)
((after_failure == before_failure + 1)) || fail 'rollback evidence was not retained after build failure'
expect_contains "$update_log" 'build --pull'
expect_absent "$update_log" 'up -d'

for forbidden in 'down ' '--volumes' '--purge-data' 'volume rm' 'randomBytes' 'prepare-identity'; do
  expect_absent "$INSTALL_DIR/update.sh" "$forbidden"
done
if "$update_root/install/update.sh" --env-file "$update_root/install/update.env" --previous-release release-v1 --dry-run >/dev/null 2>&1; then fail 'missing backup reference succeeded'; fi
if "$update_root/install/update.sh" --env-file "$update_root/install/update.env" --backup-reference backup-v1 --dry-run >/dev/null 2>&1; then fail 'missing previous release succeeded'; fi
printf 'PASS install-contract\n'
