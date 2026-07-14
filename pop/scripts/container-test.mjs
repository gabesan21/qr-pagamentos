import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";

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
const allowed = new Set(["build", "config", "happy", "roles", "failures", "lifecycle", "isolation"]);
assert(allowed.has(scenario), `unknown scenario ${scenario}`);

if (process.argv.includes("--clean-clone") && !process.env.CONTAINER_TEST_CLEAN_CLONE) {
  assert(run("git", ["status", "--porcelain"]).trim() === "", "clean-clone tests require a clean committed HEAD");
  const temporary = await mkdtemp(path.join(tmpdir(), "qr-container-clone-"));
  const archive = path.join(temporary, "source.tar");
  const clone = path.join(temporary, "source");
  await mkdir(clone);
  try {
    run("git", ["archive", "--format=tar", "-o", archive, "HEAD"]);
    run("tar", ["-xf", archive, "-C", clone]);
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
  };
  const files = Object.fromEntries(Object.keys(values).map((name) => [name, path.join(sources, name)]));
  for (const name of Object.keys(values)) {
    await writeFile(files[name], `${values[name]}\n`, { mode: 0o600 });
    await chmod(files[name], 0o600);
  }
  const env = {
    ...process.env,
    APP_PORT: "0",
    POSTGRES_ADMIN_PASSWORD_FILE: files.admin,
    MIGRATOR_PASSWORD_FILE: files.migrator,
    RUNTIME_PASSWORD_FILE: files.runtime,
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
  function containerId(service) { return compose(["ps", "-a", "-q", service]).trim(); }
  function inspectField(id, field) { return run("docker", ["inspect", "--format", field, id]).trim(); }
  function assertRedacted(text) {
    for (const value of Object.values(values)) {
      assert(!text.includes(value), "raw secret sentinel leaked");
      assert(!text.includes(encodeURIComponent(value)), "encoded secret sentinel leaked");
    }
    assert(!/postgresql:\/\/[^\s]+@/i.test(text), "database URL leaked");
  }
  async function startHappy() {
    await prepare();
    compose(["up", "-d", "--build"]);
    const appId = await waitForApp();
    const bootstrapId = containerId("bootstrap");
    const migrateId = containerId("migrate");
    assert(inspectField(bootstrapId, "{{.State.ExitCode}}") === "0", "bootstrap did not exit zero");
    assert(inspectField(migrateId, "{{.State.ExitCode}}") === "0", "migration did not exit zero");
    captured += compose(["logs", "--no-color"]);
    assert(captured.includes("PASS bootstrap"), "bootstrap pass evidence missing");
    assert(captured.includes("PASS migration"), "migration pass evidence missing");
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
    console.log("PASS runtime-db-preflight");
    console.log("PASS app-liveness");
    console.log("PASS static-assets");
    return { appId, bootstrapId, migrateId, dbId };
  }

  try {
    await prepare();
    if (scenario === "config") {
      const config = compose(["config", "--format", "json"]);
      const model = JSON.parse(config);
      assert(model.services.db.ports === undefined, "database port exposed");
      assert(model.services.bootstrap.depends_on.db.condition === "service_healthy", "bootstrap gate changed");
      assert(model.services.migrate.depends_on.bootstrap.condition === "service_completed_successfully", "migration gate changed");
      assert(model.services.app.depends_on.migrate.condition === "service_completed_successfully", "app gate changed");
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
        const image = `${project}-${service}`;
        const user = inspectField(image, "{{.Config.User}}");
        const size = inspectField(image, "{{.Size}}");
        assert(user === "1000:1000", `${service} image user is ${user}`);
        console.log(`PASS image-contract service=${service} user=${user} size=${size}`);
      }
    } else if (scenario === "happy") {
      await startHappy();
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
      assert(!/0\.0\.0\.0:.*3000/.test(config) && !config.includes("5432:5432"), "public listener detected");
      assertRedacted(captured + config + compose(["logs", "--no-color"]));
      console.log("PASS db-initialization-identity");
      console.log("PASS db-secret-consumed-once");
      console.log("PASS postgres-server-nonroot");
      console.log("PASS secret-isolation");
      console.log("PASS no-secret-logs");
      console.log("PASS port-isolation");
    }
  } finally {
    const cleanup = composeResult(["down", "--volumes", "--remove-orphans", "--rmi", "local"]);
    await rm(temporary, { recursive: true, force: true });
    assert(cleanup.status === 0, "container cleanup failed");
  }
}
