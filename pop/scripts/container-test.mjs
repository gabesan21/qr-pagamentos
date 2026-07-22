import { createHash, randomUUID } from "node:crypto";
import { chmod, copyFile, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";

import { canonicalManifest, generateSql } from "./migration-policy.mjs";

function assert(condition, message) { if (!condition) throw new Error(message); }
function execute(command, args, options = {}) {
  return spawnSync(command, args, { cwd: process.cwd(), encoding: "utf8", ...options });
}
function run(command, args, options = {}) {
  const result = execute(command, args, options);
  if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ""} failed with status ${result.status}`);
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const scenarioIndex = process.argv.indexOf("--scenario");
const scenario = scenarioIndex >= 0 ? process.argv[scenarioIndex + 1] : "happy";
const allowed = new Set(["build", "config", "happy", "login", "roles", "failures", "lifecycle", "isolation", "identity-seed", "identity-recovery", "update"]);
assert(allowed.has(scenario), `unknown scenario ${scenario}`);

if (process.argv.includes("--clean-clone") && !process.env.CONTAINER_TEST_CLEAN_CLONE) {
  assert(run("git", ["status", "--porcelain"]).trim() === "", "clean-clone tests require a clean committed HEAD");
  const temporary = await mkdtemp(path.join(tmpdir(), "qr-container-clone-"));
  const archive = path.join(temporary, "source.tar");
  const clone = path.join(temporary, "source");
  try {
    if (scenario === "update") {
      run("git", ["clone", "--quiet", "--no-local", "--branch", run("git", ["branch", "--show-current"]).trim(), process.cwd(), clone]);
    } else {
      await mkdir(clone);
      run("git", ["archive", "--format=tar", "-o", archive, "HEAD"]);
      run("tar", ["-xf", archive, "-C", clone]);
    }
    const child = execute(process.execPath, ["pop/scripts/container-test.mjs", "--scenario", scenario], {
      cwd: clone,
      env: { ...process.env, CONTAINER_TEST_CLEAN_CLONE: "1" },
      stdio: "inherit",
    });
    process.exitCode = child.status ?? 1;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
} else {
  const token = randomUUID().replaceAll("-", "").slice(0, 12);
  const project = `qrct${process.pid}${token}`.toLowerCase();
  const temporary = await mkdtemp(path.join(tmpdir(), `${project}-`));
  const sources = path.join(temporary, "sources");
  const staged = path.join(temporary, "staged");
  await mkdir(sources, { mode: 0o700 });
  const values = {
    admin: `Adm!n:/?#[]@-${token}`,
    migrator: `Mig!r:/?#[]@-${token}`,
    runtime: `Run!t:/?#[]@-${token}`,
    initial: `Initial-Admin-${token}-Password`,
  };
  const files = Object.fromEntries(Object.keys(values).map((name) => [name, path.join(sources, name)]));
  for (const name of Object.keys(values)) {
    await writeFile(files[name], `${values[name]}\n`, { mode: 0o600 });
    await chmod(files[name], 0o600);
  }
  const usernameFile = path.join(sources, "initial-username");
  const emailFile = path.join(sources, "initial-email");
  const recoveryFile = path.join(sources, "recovery");
  await writeFile(usernameFile, "admin.user\n", { mode: 0o600 });
  await writeFile(emailFile, "admin@example.com\n", { mode: 0o600 });
  await writeFile(recoveryFile, `Recovery-${token}-Password\n`, { mode: 0o600 });
  await chmod(usernameFile, 0o600);
  await chmod(emailFile, 0o600);
  await chmod(recoveryFile, 0o600);
  const env = {
    ...process.env,
    APP_PORT: "0",
    DB_OPS_IMAGE: `${project}-db-ops:fixture`,
    APP_IMAGE: `${project}-app:fixture`,
    RELEASE_REVISION: "container-test",
    POSTGRES_ADMIN_PASSWORD_FILE: files.admin,
    MIGRATOR_PASSWORD_FILE: files.migrator,
    RUNTIME_PASSWORD_FILE: files.runtime,
    INITIAL_ADMIN_USERNAME_FILE: usernameFile,
    INITIAL_ADMIN_EMAIL_FILE: emailFile,
    INITIAL_ADMIN_PASSWORD_FILE: files.initial,
    INITIAL_ADMIN_RECOVERY_PASSWORD_FILE: path.join(staged, "initial_admin_recovery_password"),
    STAGED_SECRETS_DIR: staged,
  };
  const compose = (args, options = {}) => {
    const result = execute("docker", ["compose", "-p", project, "-f", "compose.yaml", ...args], { env, ...options });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (result.status !== 0) {
      assertRedacted(output);
      throw new Error(`docker compose ${args[0] ?? ""} failed with status ${result.status}\n${output}`);
    }
    return output;
  };
  const composeResult = (args) => execute("docker", ["compose", "-p", project, "-f", "compose.yaml", ...args], { env });
  let captured = "";

  async function prepare() {
    captured += run(process.execPath, ["pop/scripts/container-prepare-secrets.mjs"], { env });
    await copyFile(recoveryFile, env.INITIAL_ADMIN_RECOVERY_PASSWORD_FILE);
    await chmod(env.INITIAL_ADMIN_RECOVERY_PASSWORD_FILE, 0o400);
  }
  async function waitForApp() {
    const id = compose(["ps", "-q", "app"]).trim();
    assert(id, "app container was not created");
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const status = run("docker", ["inspect", "--format", "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}", id]).trim();
      if (status === "healthy") return id;
      if (status === "exited" || status === "unhealthy") throw new Error(`app became ${status}`);
      await delay(1000);
    }
    throw new Error("app health timeout");
  }
  async function get(pathname) {
    const mapping = compose(["port", "app", "3000"]).trim();
    const port = Number(mapping.match(/:(\d+)$/)?.[1]);
    assert(port, "could not resolve app loopback port");
    return new Promise((resolve, reject) => {
      const request = http.get({ hostname: "127.0.0.1", port, path: pathname, timeout: 3000 }, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => { body += chunk; });
        response.on("end", () => resolve({ status: response.statusCode, body }));
      });
      request.on("error", reject);
      request.on("timeout", () => request.destroy(new Error("HTTP timeout")));
    });
  }
  async function postForm(pathname, fields, headers = {}) {
    const mapping = compose(["port", "app", "3000"]).trim();
    const port = Number(mapping.match(/:(\d+)$/)?.[1]);
    assert(port, "could not resolve app loopback port");
    const body = new URLSearchParams(fields).toString();
    return new Promise((resolve, reject) => {
      const request = http.request({
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method: "POST",
        timeout: 3000,
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "content-length": Buffer.byteLength(body),
          ...headers,
        },
      }, (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => { responseBody += chunk; });
        response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body: responseBody }));
      });
      request.on("error", reject);
      request.on("timeout", () => request.destroy(new Error("HTTP timeout")));
      request.end(body);
    });
  }
  function containerId(service) { return compose(["ps", "-a", "-q", service]).trim(); }
  function inspectField(id, field) { return run("docker", ["inspect", "--format", field, id]).trim(); }
  function assertRedacted(text) {
    for (const value of [...Object.values(values), `Recovery-${token}-Password`]) {
      assert(!text.includes(value), "raw secret sentinel leaked");
      assert(!text.includes(encodeURIComponent(value)), "encoded secret sentinel leaked");
    }
    assert(!/postgresql:\/\/[^\s]+@/i.test(text), "database URL leaked");
  }
  async function startHappy() {
    compose(["up", "-d", "--build"]);
    const appId = await waitForApp();
    const bootstrapId = containerId("bootstrap");
    const migrateId = containerId("migrate");
    const identitySeedId = containerId("identity-seed");
    assert(inspectField(bootstrapId, "{{.State.ExitCode}}") === "0", "bootstrap did not exit zero");
    assert(inspectField(migrateId, "{{.State.ExitCode}}") === "0", "migration did not exit zero");
    assert(inspectField(identitySeedId, "{{.State.ExitCode}}") === "0", "identity seed did not exit zero");
    captured += compose(["logs", "--no-color"]);
    assert(captured.includes("PASS bootstrap"), "bootstrap pass evidence missing");
    assert(captured.includes("PASS migration"), "migration pass evidence missing");
    assert(captured.includes("PASS identity-seed"), "identity seed pass evidence missing");
    assert(captured.includes("PASS runtime-db-preflight"), "runtime preflight evidence missing");
    const health = await get("/api/health");
    assert(health.status === 200 && health.body === '{"status":"ok"}', "application liveness contract failed");
    const asset = await get("/file.svg");
    assert(asset.status === 200 && asset.body.includes("<svg"), "static asset unavailable");
    assert(inspectField(appId, "{{.Config.User}}") === "1000:1000", "app image is not UID/GID 1000");
    const dbId = containerId("db");
    run("docker", ["exec", dbId, "sh", "-eu", "-c", "uid=$(awk '/^Uid:/{print $2}' /proc/1/status); test \"$uid\" -gt 0"]);
    console.log("PASS clean-build");
    console.log("PASS db-secret-consumed-once");
    console.log("PASS postgres-server-nonroot");
    console.log("PASS bootstrap");
    console.log("PASS migration");
    console.log("PASS identity-seed");
    console.log("PASS runtime-db-preflight");
    console.log("PASS app-liveness");
    console.log("PASS static-assets");
    return { appId, bootstrapId, migrateId, identitySeedId, dbId };
  }

  try {
    await prepare();
    if (scenario === "config") {
      const config = compose(["config", "--format", "json"]);
      const model = JSON.parse(config);
      assert(model.services.db.ports === undefined, "database port exposed");
      assert(model.services.bootstrap.depends_on.db.condition === "service_healthy", "bootstrap gate changed");
      assert(model.services.migrate.depends_on.bootstrap.condition === "service_completed_successfully", "migration gate changed");
      assert(model.services["identity-seed"].depends_on.migrate.condition === "service_completed_successfully", "identity seed gate changed");
      assert(model.services.app.depends_on["identity-seed"].condition === "service_completed_successfully", "app gate changed");
      assert(Object.keys(model.services.db.secrets).length === 1, "DB secret grant changed");
      console.log("PASS source-secret-permissions");
      console.log("PASS staged-secret-permissions");
      console.log("PASS compose-config");
    } else if (scenario === "build") {
      assert(process.env.CONTAINER_TEST_CLEAN_CLONE === "1", "build scenario requires --clean-clone");
      const contextProbe = path.join("pop", "worktrees", "docker-context-probe", "src", "db");
      await mkdir(contextProbe, { recursive: true });
      await writeFile(path.join(contextProbe, "client.ts"), "export const invalid: = true;\n");
      compose(["build", "--pull"]);
      console.log("PASS docker-context-exclusion");
      for (const service of ["bootstrap", "migrate", "app"]) {
        const image = service === "app" ? env.APP_IMAGE : env.DB_OPS_IMAGE;
        const user = inspectField(image, "{{.Config.User}}");
        const size = inspectField(image, "{{.Size}}");
        assert(user === "1000:1000", `${service} image user is ${user}`);
        console.log(`PASS image-contract service=${service} user=${user} size=${size}`);
      }
    } else if (scenario === "happy") {
      await startHappy();
    } else if (scenario === "login") {
      const { dbId } = await startHappy();
      const invalid = await postForm("/login/submit", { username: "admin.user", password: "invalid-password" });
      assert(invalid.status === 303, `invalid login status=${invalid.status}`);
      const invalidLocation = new URL(invalid.headers.location);
      assert(`${invalidLocation.pathname}${invalidLocation.search}` === "/login?error=invalid-credentials", "invalid login redirect changed");
      assert(invalid.headers["set-cookie"] === undefined, "invalid login created a cookie");
      console.log("PASS login-invalid-opaque");

      const valid = await postForm(
        "/login/submit",
        { username: "admin.user", password: values.initial },
        { "accept-language": "en-US,en;q=0.9" },
      );
      if (valid.status !== 303) {
        const logs = compose(["logs", "--no-color", "app"]);
        assertRedacted(logs);
        console.error(logs);
      }
      assert(valid.status === 303, `valid login status=${valid.status}`);
      assert(new URL(valid.headers.location).pathname === "/", "valid login redirect changed");
      const cookie = valid.headers["set-cookie"]?.[0];
      assert(cookie, "valid login did not create a session cookie");
      const cookieParts = cookie.split("; ");
      assert(cookieParts[0].startsWith("qr_session=") && cookieParts[0].length > "qr_session=".length, "session cookie value is absent");
      for (const attribute of ["Path=/", "Max-Age=43200", "HttpOnly", "Secure", "SameSite=lax"]) {
        assert(cookieParts.includes(attribute), `session cookie is missing ${attribute}`);
      }
      assert(cookieParts.some((part) => part.startsWith("Expires=")), "session cookie is missing Expires");
      console.log("PASS login-valid");
      console.log("PASS login-cookie-contract");

      const sql = (statement) => run("docker", ["exec", dbId, "psql", "-U", "postgres", "-d", "qr_pagamentos", "-Atc", statement]).trim();
      assert(sql(`SELECT count(*) FROM app.session`) === "1", "valid login did not persist exactly one session");
      assert(sql(`SELECT preferred_locale FROM app.\"user\" WHERE username='admin.user'`) === "en", "valid login did not persist negotiated locale");
      console.log("PASS login-locale-preference");
    } else if (scenario === "roles") {
      const { dbId } = await startHappy();
      const probe = (user, password, sql) => execute("docker", ["exec", "-e", `PGPASSWORD=${password}`, dbId, "psql", "-h", "127.0.0.1", "-U", user, "-d", "qr_pagamentos", "-v", "ON_ERROR_STOP=1", "-Atc", sql]);
      assert(probe("qr_runtime", values.runtime, "SELECT 1").status === 0, "runtime authentication failed");
      assert(probe("qr_runtime", values.runtime, "CREATE TABLE app.forbidden(id int)").status !== 0, "runtime DDL succeeded");
      assert(probe("qr_runtime", values.runtime, "SELECT * FROM app._prisma_migrations").status !== 0, "runtime metadata read succeeded");
      assert(probe("qr_runtime", values.runtime, "SET ROLE qr_migrator").status !== 0, "runtime set-role succeeded");
      assert(probe("qr_migrator", values.migrator, "SELECT rolsuper OR rolcreaterole FROM pg_roles WHERE rolname=current_user").stdout.trim() === "f", "migrator is administrative");
      console.log("PASS compose-role-separation");
    } else if (scenario === "failures") {
      const ids = await startHappy();
      console.log("PASS sql-escaping");
      console.log("PASS url-percent-encoding");
      const original = { ...values };
      const failWith = async (role, service) => {
        values[role] = `Wrong!:/?#[]@-${token}-${role}`;
        await writeFile(files[role], `${values[role]}\n`, { mode: 0o600 });
        await chmod(files[role], 0o600);
        await prepare();
        if (service === "app") compose(["stop", "app"]);
        const result = composeResult(["run", "--rm", "--no-deps", service]);
        const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
        assert(result.status !== 0, `${role} authentication unexpectedly succeeded`);
        assertRedacted(output);
        console.log(`PASS auth-fail-closed role=${role}`);
        values[role] = original[role];
        await writeFile(files[role], `${values[role]}\n`, { mode: 0o600 });
        await chmod(files[role], 0o600);
      };
      await failWith("admin", "bootstrap");
      await failWith("migrator", "migrate");
      await failWith("runtime", "app");
      assert(inspectField(ids.bootstrapId, "{{.State.ExitCode}}") === "0" && inspectField(ids.migrateId, "{{.State.ExitCode}}") === "0", "baseline jobs changed");
      assertRedacted(captured + compose(["config"]) + compose(["logs", "--no-color"]));
    } else if (scenario === "lifecycle") {
      const ids = await startHappy();
      const snapshot = [ids.bootstrapId, ids.migrateId].map((id) => inspectField(id, "{{.Id}}|{{.State.ExitCode}}|{{.State.StartedAt}}|{{.State.FinishedAt}}")).join("\n");
      const before = (captured.match(/PASS runtime-db-preflight/g) ?? []).length;
      compose(["restart", "app"]);
      await waitForApp();
      const afterLogs = compose(["logs", "--no-color", "app"]);
      const after = (afterLogs.match(/PASS runtime-db-preflight/g) ?? []).length;
      assert(after > before, "app restart did not repeat runtime preflight");
      const current = [ids.bootstrapId, ids.migrateId].map((id) => inspectField(id, "{{.Id}}|{{.State.ExitCode}}|{{.State.StartedAt}}|{{.State.FinishedAt}}")).join("\n");
      assert(current === snapshot, "one-shot job identity changed on app restart");
      compose(["stop"]);
      compose(["start"]);
      await waitForApp();
      console.log("PASS migration-noop");
      console.log("PASS app-restart-runtime-preflight");
      console.log("PASS app-restart-no-job-rerun");
      console.log("PASS persistent-restart");
      console.log("PASS cleanup");
    } else if (scenario === "isolation") {
      const { dbId, appId } = await startHappy();
      const dbMounts = inspectField(dbId, "{{json .Mounts}}");
      const appMounts = inspectField(appId, "{{json .Mounts}}");
      assert(dbMounts.includes("postgres_admin_password") && !dbMounts.includes("runtime_password"), "DB secret grant changed");
      assert(appMounts.includes("runtime_password") && !appMounts.includes("admin_password"), "app secret grant changed");
      const config = compose(["config"]);
      assert(!/0\.0\.0\.0:.*3000/.test(config) && !/(?:5432|5433):(?:5432|5433)/.test(config), "public listener detected");
      assertRedacted(captured + config + compose(["logs", "--no-color"]));
      console.log("PASS db-initialization-identity");
      console.log("PASS db-secret-consumed-once");
      console.log("PASS postgres-server-nonroot");
      console.log("PASS secret-isolation");
      console.log("PASS no-secret-logs");
      console.log("PASS port-isolation");
    } else if (scenario === "identity-seed") {
      const { dbId } = await startHappy();
      const sql = (statement) => run("docker", ["exec", dbId, "psql", "-U", "postgres", "-d", "qr_pagamentos", "-Atc", statement]).trim();
      const before = sql(`SELECT u.id || '|' || u.username || '|' || COALESCE(u.email, '<null>') || '|' || u.role || '|' || u.status FROM app.deployment_bootstrap b JOIN app."user" u ON u.id=b.initial_admin_user_id WHERE b.id=1`);
      assert(before.split("|").slice(1).join("|") === "admin.user|admin@example.com|ADMIN|ACTIVE", "present-email seed differs");
      sql(`ALTER TABLE app.deployment_bootstrap DISABLE TRIGGER deployment_bootstrap_immutable; TRUNCATE app.session, app.password_credential, app.deployment_bootstrap, app."user"; ALTER TABLE app.deployment_bootstrap ENABLE TRIGGER deployment_bootstrap_immutable`);
      await writeFile(usernameFile, "second.admin\n", { mode: 0o600 });
      await writeFile(emailFile, "", { mode: 0o600 });
      await chmod(usernameFile, 0o600);
      await chmod(emailFile, 0o600);
      await prepare();
      const absentSeed = composeResult(["run", "--rm", "--no-deps", "identity-seed"]);
      assert(absentSeed.status === 0, "absent-email identity seed failed");
      const absent = sql(`SELECT u.id || '|' || u.username || '|' || COALESCE(u.email, '<null>') || '|' || u.role || '|' || u.status FROM app.deployment_bootstrap b JOIN app."user" u ON u.id=b.initial_admin_user_id WHERE b.id=1`);
      assert(absent.split("|").slice(1).join("|") === "second.admin|<null>|ADMIN|ACTIVE", "absent-email seed differs");
      await writeFile(usernameFile, "invalid..admin\n", { mode: 0o600 });
      await chmod(usernameFile, 0o600);
      await prepare();
      const invalidSeed = composeResult(["run", "--rm", "--no-deps", "identity-seed"]);
      assert(invalidSeed.status !== 0, "invalid username seed succeeded");
      assert(sql(`SELECT u.id || '|' || u.username || '|' || COALESCE(u.email, '<null>') || '|' || u.role || '|' || u.status FROM app.deployment_bootstrap b JOIN app."user" u ON u.id=b.initial_admin_user_id WHERE b.id=1`) === absent, "invalid seed mutated identity");
      await writeFile(usernameFile, "changed.admin\n", { mode: 0o600 });
      await writeFile(emailFile, "changed@example.com\n", { mode: 0o600 });
      await chmod(usernameFile, 0o600);
      await chmod(emailFile, 0o600);
      await prepare();
      const rerun = composeResult(["run", "--rm", "--no-deps", "identity-seed"]);
      assert(rerun.status === 0, "identity seed rerun failed");
      assert(sql(`SELECT u.id || '|' || u.username || '|' || COALESCE(u.email, '<null>') || '|' || u.role || '|' || u.status FROM app.deployment_bootstrap b JOIN app."user" u ON u.id=b.initial_admin_user_id WHERE b.id=1`) === absent, "seed rerun mutated or retargeted identity");
      assert(sql(`SELECT count(*) FROM app.deployment_bootstrap`) === "1" && sql(`SELECT count(*) FROM app."user"`) === "1", "seed is not singleton/idempotent");
      assertRedacted(`${rerun.stdout ?? ""}${rerun.stderr ?? ""}`);
      console.log("PASS identity-seed-idempotence");
      console.log("PASS identity-seed-present-email");
      console.log("PASS identity-seed-absent-email");
      console.log("PASS identity-seed-invalid-username-abort");
      console.log("PASS identity-fields-no-retarget");
    } else if (scenario === "update") {
      assert(process.env.CONTAINER_TEST_CLEAN_CLONE === "1", "update scenario requires --clean-clone");
      const installerEnv = path.join(temporary, "update.env");
      const evidenceDirectory = path.join(temporary, "update-evidence");
      const sourceKey = Buffer.alloc(32, 11).toString("base64url");
      const branch = run("git", ["branch", "--show-current"]).trim();
      const updateRemote = path.join(temporary, "update-remote.git");
      await run("git", ["init", "--bare", updateRemote]);
      run("git", ["push", updateRemote, `HEAD:refs/heads/${branch}`]);
      run("git", ["remote", "set-url", "origin", updateRemote]);
      const publishSafeMigration = async (id, table) => {
        const producer = path.join(temporary, `update-producer-${id}`);
        run("git", ["clone", "--quiet", "--branch", branch, updateRemote, producer]);
        run("git", ["config", "user.email", "container-test@example.invalid"], { cwd: producer });
        run("git", ["config", "user.name", "Container Test"], { cwd: producer });
        const directory = path.join(producer, "prisma", "migrations", id);
        const manifest = {
          version: 1,
          id,
          operations: [{
            op: "createTable",
            table: { schema: "app", name: table },
            columns: [{ name: "id", type: { name: "integer" }, nullable: false }],
          }],
        };
        await mkdir(directory);
        await writeFile(path.join(directory, "migration.safe.json"), canonicalManifest(manifest));
        await writeFile(path.join(directory, "migration.sql"), generateSql(manifest));
        run("git", ["add", "prisma/migrations"] , { cwd: producer });
        run("git", ["commit", "-m", `test: add ${id}`], { cwd: producer });
        run("git", ["push", "origin", branch], { cwd: producer });
      };
      await writeFile(installerEnv, `APP_PORT=33013
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_USERNAME=admin.user
POSTGRES_ADMIN_PASSWORD=${values.admin}
MIGRATOR_PASSWORD=${values.migrator}
RUNTIME_PASSWORD=${values.runtime}
NAUTT_ENCRYPTION_KEY=${sourceKey}
NAUTT_WEBHOOK_CALLBACK_URL=https://payments.example.com/api/nautt/webhooks
`, { mode: 0o600 });
      await chmod(installerEnv, 0o600);
      const updateProcessEnv = { ...process.env, CONTAINER_TEST_PROJECT: project };
      const invoke = (script, args) => {
        const result = execute(script, args, { env: updateProcessEnv });
        const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
        assertRedacted(output);
        assert(!output.includes(sourceKey), "Nautt key leaked from operator command");
        if (result.status !== 0) throw new Error(`${script} failed with status ${result.status}\n${output}`);
        return output;
      };
      const digest = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
      const assertUpdateStartup = async (output) => {
        await waitForApp();
        for (const service of ["bootstrap", "identity-seed"]) {
          const id = containerId(service);
          assert(id && inspectField(id, "{{.State.ExitCode}}") === "0", `${service} update gate failed`);
        }
        const logs = compose(["logs", "--no-color"]);
        assert(logs.includes("PASS bootstrap") && logs.includes("PASS identity-seed"), "one-shot update evidence missing");
        if (output) assert(output.includes("PASS migration-complete") && output.includes("PASS update-complete"), "fresh migration completion evidence missing");
        assert(logs.includes("PASS runtime-db-preflight"), "update runtime preflight evidence missing");
        const health = await get("/api/health");
        assert(health.status === 200 && health.body === '{"status":"ok"}', "update exact health contract failed");
        assertRedacted(logs);
      };

      captured += invoke("install/install.sh", ["--env-file", installerEnv]);
      await assertUpdateStartup();
      const sourceKeyPath = path.resolve(".install-secrets", "nautt_encryption_key");
      const stagedKeyPath = path.resolve(".container-secrets", "nautt_encryption_key");
      const volumeIdentity = run("docker", ["volume", "inspect", "--format", "{{.Name}}|{{.Mountpoint}}|{{.CreatedAt}}", `${project}_postgres-data`]).trim();
      const sourceDigest = await digest(sourceKeyPath);
      const stagedDigest = await digest(stagedKeyPath);
      const updateArgs = ["--env-file", installerEnv, "--evidence-dir", evidenceDirectory];
      const migrateIds = [];
      await publishSafeMigration("20260722000100_update_pending", "update_pending_migration");
      for (const invocation of ["clean-install", "no-op-rerun"]) {
        const output = invoke("install/update.sh", updateArgs);
        captured += output;
        await assertUpdateStartup(output);
        const migrateName = output.match(/PASS update-complete revision=[0-9a-f]{40} migrate=([^ ]+)/)?.[1];
        assert(migrateName, `${invocation} migration container evidence missing`);
        migrateIds.push(inspectField(migrateName, "{{.Id}}"));
        assert(inspectField(migrateName, "{{.State.ExitCode}}") === "0", `${invocation} migration container failed`);
        const appId = containerId("app");
        const migrationFinished = Date.parse(inspectField(migrateName, "{{.State.FinishedAt}}"));
        const appStarted = Date.parse(inspectField(appId, "{{.State.StartedAt}}"));
        assert(migrationFinished <= appStarted, `${invocation} app started before migration finished`);
        const appImage = inspectField(appId, "{{.Image}}");
        assert(inspectField(appImage, '{{index .Config.Labels "org.opencontainers.image.revision"}}') === run("git", ["rev-parse", "HEAD"]).trim(), "target app image revision mismatch");
        assert(run("docker", ["volume", "inspect", "--format", "{{.Name}}|{{.Mountpoint}}|{{.CreatedAt}}", `${project}_postgres-data`]).trim() === volumeIdentity, "update changed PostgreSQL volume identity");
        assert(await digest(sourceKeyPath) === sourceDigest, "update changed source Nautt key");
        assert(await digest(stagedKeyPath) === stagedDigest, "update changed staged Nautt key");
      }
      assert(migrateIds[0] !== migrateIds[1], "no-op update reused the migration container");
      const currentApp = containerId("app");
      const currentImage = inspectField(currentApp, "{{.Image}}");
      const currentHealth = inspectField(currentApp, "{{.State.Health.Status}}");
      const dbId = containerId("db");
      const dataBeforeFailure = run("docker", ["exec", dbId, "psql", "-U", "postgres", "-d", "qr_pagamentos", "-Atc", 'SELECT id || \'|\' || username || \'|\' || COALESCE(email, \'<null>\') FROM app."user" ORDER BY id']).trim();
      const migrationsBeforeFailure = new Set(run("docker", ["ps", "-a", "--filter", `name=${project}-update-migrate-`, "--format", "{{.ID}}"]).trim().split("\n").filter(Boolean));
      await publishSafeMigration("20260722000200_update_prisma_failure", "update_pending_migration");
      const failed = execute("install/update.sh", updateArgs, { env: updateProcessEnv });
      assert(failed.status !== 0, "forced migration failure succeeded");
      const failedMigrations = run("docker", ["ps", "-a", "--filter", `name=${project}-update-migrate-`, "--format", "{{.ID}}"]).trim().split("\n").filter((id) => !migrationsBeforeFailure.has(id));
      assert(failedMigrations.length === 1, "failed update did not create exactly one migration container");
      assert(inspectField(failedMigrations[0], "{{.State.ExitCode}}") !== "0", "policy-valid failing migration did not fail in Prisma");
      assert(run("docker", ["logs", failedMigrations[0]]).includes("ERROR migration code=MIGRATE"), "failed migration did not reach the Prisma wrapper");
      assert(containerId("app") === currentApp && inspectField(currentApp, "{{.Image}}") === currentImage, "migration failure replaced the old app");
      assert(inspectField(currentApp, "{{.State.Health.Status}}") === currentHealth && currentHealth === "healthy", "migration failure damaged app health");
      assert(run("docker", ["volume", "inspect", "--format", "{{.Name}}|{{.Mountpoint}}|{{.CreatedAt}}", `${project}_postgres-data`]).trim() === volumeIdentity, "migration failure changed PostgreSQL volume identity");
      assert(run("docker", ["exec", dbId, "psql", "-U", "postgres", "-d", "qr_pagamentos", "-Atc", 'SELECT id || \'|\' || username || \'|\' || COALESCE(email, \'<null>\') FROM app."user" ORDER BY id']).trim() === dataBeforeFailure, "migration failure changed sentinel data");
      assert(await digest(sourceKeyPath) === sourceDigest && await digest(stagedKeyPath) === stagedDigest, "migration failure changed key continuity");
      assert((await readdir(evidenceDirectory)).length === 3, "update evidence was not retained for success and failure runs");
      console.log("PASS update-install-baseline");
      console.log("PASS update-rerun");
      console.log("PASS update-volume-identity");
      console.log("PASS update-nautt-key-continuity");
      console.log("PASS update-startup-gates");
      console.log("PASS update-pulled-pending-migration");
      console.log("PASS update-prisma-failure-retention");
      console.log("PASS update-failure-retains-app");
      console.log("PASS update-evidence-retention");
    } else if (scenario === "identity-recovery") {
      assert(process.env.CONTAINER_TEST_CLEAN_CLONE === "1", "identity recovery requires --clean-clone");
      const { dbId } = await startHappy();
      const sql = (statement) => run("docker", ["exec", dbId, "psql", "-U", "postgres", "-d", "qr_pagamentos", "-Atc", statement]).trim();
      const userId = sql(`SELECT initial_admin_user_id FROM app.deployment_bootstrap WHERE id=1`);
      const oldHash = sql(`SELECT password_hash FROM app.password_credential WHERE user_id='${userId}'`);
      sql(`UPDATE app."user" SET username='renamed.admin', email='renamed@example.com', role='USER', status='DISABLED' WHERE id='${userId}'`);
      const identityBeforeRecovery = sql(`SELECT username || '|' || email FROM app."user" WHERE id='${userId}'`);

      const shimDirectory = path.join(temporary, "docker-shim");
      const shimLog = path.join(temporary, "docker-shim.log");
      const candidateSnapshot = path.join(temporary, "recovery-candidate");
      const installerEnv = path.join(temporary, "install.env");
      const realDocker = run("sh", ["-c", "command -v docker"]).trim();
      await mkdir(shimDirectory, { mode: 0o700 });
      await writeFile(path.join(shimDirectory, "docker"), `#!/usr/bin/env bash
set -Eeuo pipefail
rewritten=()
replace_project=false
is_recovery=false
for argument in "$@"; do
  if "$replace_project" && [[ $argument == qr-pagamentos ]]; then argument=$CONTAINER_TEST_PROJECT; fi
  rewritten+=("$argument")
  [[ $argument == -p ]] && replace_project=true || replace_project=false
  [[ $argument == identity-recovery ]] && is_recovery=true
done
if "$is_recovery"; then
  for variable in APP_PORT POSTGRES_ADMIN_PASSWORD_FILE MIGRATOR_PASSWORD_FILE RUNTIME_PASSWORD_FILE STAGED_SECRETS_DIR INITIAL_ADMIN_RECOVERY_PASSWORD_FILE; do
    [[ -n \${!variable:-} ]] || { printf 'missing helper path: %s\n' "$variable" >&2; exit 97; }
  done
  cp .install-secrets/initial_admin_recovery_password "$CONTAINER_TEST_CANDIDATE_SNAPSHOT"
  chmod 0600 "$CONTAINER_TEST_CANDIDATE_SNAPSHOT"
  printf 'PASS helper-forwarded-base-and-recovery-paths\n' >> "$CONTAINER_TEST_DOCKER_LOG"
fi
exec ${realDocker} "\${rewritten[@]}"
`, { mode: 0o700 });
      await chmod(path.join(shimDirectory, "docker"), 0o700);
      await writeFile(installerEnv, `APP_PORT=33013
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_USERNAME=admin.user
POSTGRES_ADMIN_PASSWORD=${values.admin}
MIGRATOR_PASSWORD=${values.migrator}
RUNTIME_PASSWORD=${values.runtime}
`, { mode: 0o600 });
      await chmod(installerEnv, 0o600);
      const installerProcessEnv = {
        ...process.env,
        PATH: `${shimDirectory}:${process.env.PATH}`,
        CONTAINER_TEST_PROJECT: project,
        CONTAINER_TEST_DOCKER_LOG: shimLog,
        CONTAINER_TEST_CANDIDATE_SNAPSHOT: candidateSnapshot,
      };
      const recover = () => execute("install/install.sh", ["--recover-initial-admin", "--env-file", installerEnv], { env: installerProcessEnv });
      const recovered = recover();
      assert(recovered.status === 0, "identity recovery failed");
      const recoveredOutput = `${recovered.stdout ?? ""}${recovered.stderr ?? ""}`;
      const sourceDirectory = path.resolve(".install-secrets");
      const stagedDirectory = path.resolve(".container-secrets");
      const promotedPassword = await readFile(path.join(sourceDirectory, "initial_admin_password"), "utf8");
      const promotedCandidate = await readFile(candidateSnapshot, "utf8");
      assert(promotedPassword === promotedCandidate, "successful recovery did not promote its exact candidate");
      assert((await stat(path.join(sourceDirectory, "initial_admin_password"))).mode % 0o1000 === 0o600, "promoted password mode changed");
      await stat(path.join(sourceDirectory, "initial_admin_recovery_password")).then(
        () => { throw new Error("source recovery candidate was not removed"); },
        (error) => assert(error?.code === "ENOENT", "source recovery candidate removal was not observable"),
      );
      await stat(path.join(stagedDirectory, "initial_admin_recovery_password")).then(
        () => { throw new Error("staged recovery candidate was not removed"); },
        (error) => assert(error?.code === "ENOENT", "staged recovery candidate removal was not observable"),
      );
      assert((await readFile(shimLog, "utf8")).includes("PASS helper-forwarded-base-and-recovery-paths"), "installer compose helper was not exercised");
      assert(sql(`SELECT username || '|' || email || '|' || role || '|' || status FROM app."user" WHERE id='${userId}'`) === `${identityBeforeRecovery}|ADMIN|ACTIVE`, "recovery renamed or failed to restore target");
      assert(sql(`SELECT password_hash FROM app.password_credential WHERE user_id='${userId}'`) !== oldHash, "recovery did not rotate credential");
      sql(`DELETE FROM app."user" WHERE id='${userId}'`);
      const missing = recover();
      assert(missing.status !== 0 && sql(`SELECT count(*) FROM app."user"`) === "0", "missing locator target was recreated");
      const retainedCandidate = await readFile(path.join(sourceDirectory, "initial_admin_recovery_password"), "utf8");
      assert(retainedCandidate === await readFile(candidateSnapshot, "utf8"), "failed recovery did not retain the retry candidate");
      assert(await readFile(path.join(stagedDirectory, "initial_admin_recovery_password"), "utf8") === retainedCandidate, "failed recovery did not retain the staged candidate");
      const recoveryOutput = `${recoveredOutput}${missing.stdout ?? ""}${missing.stderr ?? ""}`;
      assert(!recoveryOutput.includes(promotedCandidate) && !recoveryOutput.includes(retainedCandidate), "generated recovery candidate leaked");
      assertRedacted(recoveryOutput);
      console.log("PASS installer-recovery-helper-paths");
      console.log("PASS installer-recovery-candidate-promotion");
      console.log("PASS installer-recovery-failure-retention");
      console.log("PASS identity-recovery-uuid-target");
      console.log("PASS identity-recovery-deleted-target-abort");
    }
  } finally {
    const cleanup = composeResult(["down", "--volumes", "--remove-orphans", "--rmi", "local"]);
    await rm(temporary, { recursive: true, force: true });
    assert(cleanup.status === 0, "container cleanup failed");
  }
}
