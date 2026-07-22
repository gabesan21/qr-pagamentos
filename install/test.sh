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
valid_nautt_key=$(node -e 'process.stdout.write(Buffer.alloc(32, 248).toString("base64url"))')
[[ ${#valid_nautt_key} -ge 32 ]] || fail 'generated Nautt key is unexpectedly short'
[[ $valid_nautt_key == -* ]] || fail 'leading-hyphen Nautt key regression fixture changed'
node -e 'process.exit(Buffer.from(process.argv[1], "base64url").length === 32 ? 0 : 1)' -- "$valid_nautt_key" || fail 'valid Nautt key length check failed'
node -e 'process.exit(Buffer.from(process.argv[1], "base64url").length === 32 ? 0 : 1)' -- 'aG9zdA' && fail 'invalid Nautt key length check succeeded' || true
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

# Dedicated self-update fixture: real tracked upstream plus an isolated Docker shim.
update_source=$TMP/update-source
update_remote=$TMP/update-remote.git
update_root=$TMP/update-root
mkdir -p "$update_source/install" "$update_source/pop/scripts" "$update_source/prisma/migrations" "$update_source/bin"
cp "$INSTALL_DIR/update.sh" "$update_source/install/update.sh"
cp "$INSTALL_DIR/../compose.yaml" "$update_source/compose.yaml"
cp "$INSTALL_DIR/../pop/scripts/migration-policy.mjs" "$update_source/pop/scripts/migration-policy.mjs"
cp "$INSTALL_DIR/../prisma/migration-policy-baseline.json" "$update_source/prisma/migration-policy-baseline.json"
cp -R "$INSTALL_DIR/../prisma/migrations/." "$update_source/prisma/migrations/"
printf '%s\n' '/.install-secrets/' '/.container-secrets/' '/.update-evidence/' '/install/*.env' '/bin/' > "$update_source/.gitignore"
git -C "$update_source" init -q -b main
git -C "$update_source" config user.email test@example.invalid
git -C "$update_source" config user.name 'Contract Test'
git -C "$update_source" add .
git -C "$update_source" commit -qm baseline
git init -q --bare "$update_remote"
git -C "$update_source" remote add origin "$update_remote"
git -C "$update_source" push -qu origin main
git -C "$update_remote" symbolic-ref HEAD refs/heads/main
git clone -q "$update_remote" "$update_root"
git -C "$update_root" config user.email test@example.invalid
git -C "$update_root" config user.name 'Contract Test'
printf '%s\n' pulled > "$update_source/pulled.marker"
git -C "$update_source" add pulled.marker
git -C "$update_source" commit -qm target
git -C "$update_source" push -q

update_key=$(node -e 'process.stdout.write(Buffer.alloc(32, 7).toString("base64url"))')
prepare_update_runtime() {
  local root=$1 secret
  mkdir -m 0700 "$root/.install-secrets" "$root/.container-secrets"
  for secret in postgres_admin_password migrator_password runtime_password initial_admin_username initial_admin_email initial_admin_password; do
    printf '%s' "source-$secret" > "$root/.install-secrets/$secret"; chmod 0600 "$root/.install-secrets/$secret"
  done
  printf '%s' "$update_key" > "$root/.install-secrets/nautt_encryption_key"; chmod 0600 "$root/.install-secrets/nautt_encryption_key"
  for secret in admin_password migrator_password runtime_password initial_admin_username initial_admin_email initial_admin_password; do
    printf '%s' "staged-$secret" > "$root/.container-secrets/$secret"; chmod 0400 "$root/.container-secrets/$secret"
  done
  printf '%s' "$update_key" > "$root/.container-secrets/nautt_encryption_key"; chmod 0400 "$root/.container-secrets/nautt_encryption_key"
  cat > "$root/install/.env" <<EOF
APP_PORT=33013
NAUTT_ENCRYPTION_KEY=$update_key
NAUTT_WEBHOOK_CALLBACK_URL=https://payments.example.com/api/nautt/webhooks
EOF
  chmod 0600 "$root/install/.env"
  cp "$root/install/.env" "$root/install/update.env"
  chmod 0600 "$root/install/update.env"
  mkdir -p "$root/bin"
  cp "$TMP/docker-shim" "$root/bin/docker"
}

cat > "$TMP/docker-shim" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >> "$FAKE_DOCKER_LOG"
revision=${QR_UPDATE_TARGET_SHA:-unknown}
if [[ $1 == info ]]; then exit 0; fi
if [[ $1 == image && $2 == inspect && $3 != --format ]]; then exit 0; fi
if [[ $1 == image && $2 == inspect ]]; then printf '%s\n' "$revision"; exit 0; fi
if [[ $1 == run ]]; then
  if [[ " $* " == *' migration-policy.mjs verify '* ]]; then
    printf 'PASS migration-policy baseline=19 future=0\n'
  fi
  exit 0
fi
if [[ $1 == volume && $2 == inspect ]]; then
  if [[ $3 == --format && $4 == *Mountpoint* ]]; then printf '%s\n' "qr-pagamentos_postgres-data|/fixture|2026-07-22T00:00:00Z"
  else printf '%s\n' 'local|qr-pagamentos|postgres-data|qr-pagamentos_postgres-data'; fi
  exit 0
fi
if [[ $1 == inspect ]]; then
  format=$3; id=$4
  case "$format" in
    *com.docker.compose.project*) printf '%s\n' 'qr-pagamentos|db' ;;
    *'.Mounts'*) printf '%s\n' 'qr-pagamentos_postgres-data|/var/lib/postgresql' ;;
    *'.Image'*) printf '%s\n' "sha256:$id" ;;
    *'.State.ExitCode'*) printf '0\n' ;;
    *org.opencontainers.image.revision*) printf '%s\n' "$revision" ;;
    *'.State.Health'*) printf 'healthy\n' ;;
    *) exit 96 ;;
  esac
  exit 0
fi
[[ $1 == compose ]] || exit 95
shift
if [[ $1 == version ]]; then printf '5.3.1\n'; exit 0; fi
while (($#)); do case "$1" in -f|-p) shift 2 ;; *) break ;; esac; done
case "$1" in
  ps) printf '%s-id\n' "${@: -1}" ;;
  build) : ;;
  run) printf 'PASS disposable-job\n' ;;
  up) : ;;
  *) exit 94 ;;
esac
EOF
chmod 0700 "$TMP/docker-shim"
prepare_update_runtime "$update_root"
update_log=$TMP/update-docker.log
: > "$update_log"
update_out=$TMP/update.out
if ! env PATH="$update_root/bin:$PATH" FAKE_DOCKER_LOG="$update_log" "$update_root/install/update.sh" > "$update_out" 2>&1; then
  cat "$update_out" >&2; fail 'bare self-update failed'
fi
expect_contains "$update_out" 'PASS update-complete'
[[ -f $update_root/pulled.marker ]] || fail 'upstream target was not pulled'
[[ $(git -C "$update_root" rev-parse HEAD) == $(git -C "$update_root" rev-parse '@{upstream}') ]] || fail 'HEAD is not exact upstream SHA'
[[ $(grep -c 'migration-policy.mjs verify' "$update_log") == 1 ]] || fail 'pulled policy verifier did not run exactly once'
expect_contains "$update_log" '--pull=never --network none --read-only'
expect_contains "$update_log" "--user $(id -u):$(id -g)"
expect_contains "$update_log" "$update_root:/workspace:ro"
policy_line=$(grep 'migration-policy.mjs verify' "$update_log")
[[ $policy_line != *' -e '* && $policy_line != *DATABASE_URL* && $policy_line != *.install-secrets* && $policy_line != *.container-secrets* ]] \
  || fail 'offline policy verifier received environment, database, or secret access'
expect_contains "$update_log" 'build --pull bootstrap app'
migrate_line=$(grep -n 'run --name .* --no-deps migrate' "$update_log" | cut -d: -f1)
app_line=$(grep -n 'up -d --no-deps --force-recreate app' "$update_log" | cut -d: -f1)
[[ -n $migrate_line && -n $app_line && $migrate_line -lt $app_line ]] || fail 'migration did not finish before app promotion'
expect_absent "$update_out" "$update_key"
evidence_file=$(find "$update_root/.update-evidence" -maxdepth 1 -name 'update-*.txt' -type f)
[[ -n $evidence_file && $(stat -c '%a' "$evidence_file") == 400 ]] || fail 'protected update evidence was not created'
for field in target_revision head_revision upstream_revision previous_app_container previous_app_image volume_identity; do expect_contains "$evidence_file" "$field="; done
expect_absent "$evidence_file" 'backup_reference='
expect_absent "$evidence_file" 'previous_release='
expect_absent "$evidence_file" "$update_key"

for removed in --backup-reference --previous-release; do
  if "$update_root/install/update.sh" "$removed" value >/dev/null 2>&1; then fail "removed option succeeded: $removed"; fi
done

expect_git_refusal() {
  local label=$1 root=$2; shift 2
  : > "$update_log"
  if env PATH="$root/bin:$PATH" FAKE_DOCKER_LOG="$update_log" "$@" "$root/install/update.sh" --env-file "$root/install/update.env" >/dev/null 2>&1; then
    fail "unsafe Git state succeeded: $label"
  fi
  [[ ! -s $update_log ]] || fail "unsafe Git state reached Docker: $label"
}

git_fixture() {
  local label=$1
  local root=$TMP/git-$label
  git clone -q "$update_remote" "$root"
  git -C "$root" config user.email test@example.invalid
  git -C "$root" config user.name 'Contract Test'
  prepare_update_runtime "$root"
  printf '%s' "$root"
}

probe=$(git_fixture dirty); printf '\n# dirty\n' >> "$probe/compose.yaml"; expect_git_refusal dirty "$probe"
probe=$(git_fixture untracked); printf x > "$probe/untracked"; expect_git_refusal untracked "$probe"
probe=$(git_fixture detached); git -C "$probe" checkout -q --detach; expect_git_refusal detached "$probe"
probe=$(git_fixture no-upstream); git -C "$probe" branch --unset-upstream; expect_git_refusal no-upstream "$probe"
probe=$(git_fixture ahead); printf ahead > "$probe/ahead"; git -C "$probe" add ahead; git -C "$probe" commit -qm ahead; expect_git_refusal ahead "$probe"
diverged_remote=$TMP/diverged-remote.git
git clone -q --bare "$update_remote" "$diverged_remote"
git -C "$diverged_remote" symbolic-ref HEAD refs/heads/main
probe=$TMP/git-diverged
git clone -q "$diverged_remote" "$probe"
git -C "$probe" config user.email test@example.invalid; git -C "$probe" config user.name 'Contract Test'; prepare_update_runtime "$probe"
printf local > "$probe/local"; git -C "$probe" add local; git -C "$probe" commit -qm local
diverged_writer=$TMP/diverged-writer
git clone -q "$diverged_remote" "$diverged_writer"
git -C "$diverged_writer" config user.email test@example.invalid; git -C "$diverged_writer" config user.name 'Contract Test'
printf remote > "$diverged_writer/remote"; git -C "$diverged_writer" add remote; git -C "$diverged_writer" commit -qm remote; git -C "$diverged_writer" push -q
expect_git_refusal diverged-non-ff "$probe"
probe=$(git_fixture unreachable); git -C "$probe" remote set-url origin "$TMP/missing-remote"; expect_git_refusal unreachable "$probe"
probe=$(git_fixture target-mismatch); expect_git_refusal target-mismatch "$probe" env QR_UPDATE_REENTRY_COUNT=1 QR_UPDATE_TARGET_SHA=0000000000000000000000000000000000000000
probe=$(git_fixture second-reentry); expect_git_refusal second-reentry "$probe" env QR_UPDATE_REENTRY_COUNT=2 QR_UPDATE_TARGET_SHA=$(git -C "$probe" rev-parse HEAD)

for forbidden in 'down ' '--volumes' '--purge-data' 'volume rm' 'randomBytes' 'prepare-identity'; do expect_absent "$INSTALL_DIR/update.sh" "$forbidden"; done
printf 'PASS install-contract\n'
