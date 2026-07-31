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
const allowed = new Set(["build", "config", "happy", "login", "roles", "failures", "lifecycle", "isolation", "identity-seed", "identity-recovery", "install-lifecycle", "media", "media-backup", "media-restore", "update", "production-rehearsal"]);
assert(allowed.has(scenario), `unknown scenario ${scenario}`);

if (process.argv.includes("--clean-clone") && !process.env.CONTAINER_TEST_CLEAN_CLONE) {
  assert(run("git", ["status", "--porcelain"]).trim() === "", "clean-clone tests require a clean committed HEAD");
  const temporary = await mkdtemp(path.join(tmpdir(), "qr-container-clone-"));
  const archive = path.join(temporary, "source.tar");
  const clone = path.join(temporary, "source");
  try {
    if (["install-lifecycle", "update", "media-backup", "media-restore", "production-rehearsal"].includes(scenario)) {
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
    nautt: Buffer.alloc(32, 23).toString("base64url"),
    smtpHost: "smtp.container-test.invalid",
    smtpPort: "587",
    smtpUser: `smtp-user-${token}`,
    smtpPassword: `Smtp-Pass-${token}`,
    smtpFrom: "noreply@container-test.invalid",
    smtpTlsMode: "starttls",
    publicOrigin: "https://container-test.invalid",
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
    NAUTT_WEBHOOK_CALLBACK_URL: "https://container-test.invalid/api/nautt/webhooks",
    SMTP_HOST_FILE: files.smtpHost,
    SMTP_PORT_FILE: files.smtpPort,
    SMTP_USER_FILE: files.smtpUser,
    SMTP_PASSWORD_FILE: files.smtpPassword,
    SMTP_FROM_FILE: files.smtpFrom,
    SMTP_TLS_MODE_FILE: files.smtpTlsMode,
    PUBLIC_ORIGIN_FILE: files.publicOrigin,
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
    await copyFile(files.nautt, path.join(staged, "nautt_encryption_key"));
    await chmod(path.join(staged, "nautt_encryption_key"), 0o400);
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
  async function get(pathname, headers = {}) {
    const mapping = compose(["port", "app", "3000"]).trim();
    const port = Number(mapping.match(/:(\d+)$/)?.[1]);
    assert(port, "could not resolve app loopback port");
    return new Promise((resolve, reject) => {
      const request = http.get({ hostname: "127.0.0.1", port, path: pathname, timeout: 3000, headers }, (response) => {
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
    const sentinels = [...Object.entries(values), ["initialRecovery", `Recovery-${token}-Password`]];
    for (const [name, value] of sentinels) {
      // Short sentinels (e.g. the SMTP port "587") are substrings of random ports,
      // SHAs and timestamps in normal output — checking them false-positives.
      // Every actual credential in this harness is a long random string.
      if (value.length < 8) continue;
      assert(!text.includes(value), `raw secret sentinel leaked: ${name}`);
      assert(!text.includes(encodeURIComponent(value)), `encoded secret sentinel leaked: ${name}`);
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

  async function loginCookie(username, password) {
    const response = await postForm("/login/submit", { username, password }, {
      origin: values.publicOrigin,
      "x-forwarded-host": "container-test.invalid",
    });
    if (response.status !== 303) {
      const logs = compose(["logs", "--no-color", "app"]);
      assertRedacted(logs);
    }
    assert(response.status === 303, `login failed for ${username} status=${response.status}`);
    const cookies = response.headers["set-cookie"];
    assert(cookies && cookies.length > 0, "login did not set cookie");
    const session = cookies.find((cookie) => cookie.startsWith("qr_session="));
    assert(session, "session cookie missing");
    return session.split(";")[0];
  }
  async function postJson(pathname, body, cookie, headers = {}) {
    const mapping = compose(["port", "app", "3000"]).trim();
    const port = Number(mapping.match(/:(\d+)$/)?.[1]);
    assert(port, "could not resolve app loopback port");
    const json = JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const request = http.request({
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method: "POST",
        timeout: 5000,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(json),
          ...(cookie ? { cookie } : {}),
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
      request.end(json);
    });
  }
  function buildMultipartBody(fields) {
    const boundary = `----formdata-${randomUUID()}`;
    const chunks = [];
    for (const field of fields) {
      chunks.push(Buffer.from(`--${boundary}\r\n`));
      if (field.filename) {
        chunks.push(Buffer.from(`Content-Disposition: form-data; name="${field.name}"; filename="${field.filename}"\r\n`));
        chunks.push(Buffer.from(`Content-Type: ${field.contentType}\r\n\r\n`));
      } else {
        chunks.push(Buffer.from(`Content-Disposition: form-data; name="${field.name}"\r\n\r\n`));
      }
      chunks.push(Buffer.isBuffer(field.value) ? field.value : Buffer.from(String(field.value)));
      chunks.push(Buffer.from("\r\n"));
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    return { boundary, body: Buffer.concat(chunks) };
  }
  async function postMultipart(pathname, fields, cookie, headers = {}) {
    const { boundary, body } = buildMultipartBody(fields);
    const mapping = compose(["port", "app", "3000"]).trim();
    const port = Number(mapping.match(/:(\d+)$/)?.[1]);
    assert(port, "could not resolve app loopback port");
    return new Promise((resolve, reject) => {
      const request = http.request({
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method: "POST",
        timeout: 5000,
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
          "content-length": body.length,
          cookie,
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
  async function deployMockSmtp(networkName, captureDir) {
    const smtpScript = `
import { createServer } from "node:net";
import { writeFileSync } from "node:fs";
const capturePath = "/mail/captured.eml";
const server = createServer((socket) => {
  let buffer = "";
  let inData = false;
  let message = "";
  const write = (code, text) => { socket.write(\`\${code} \${text}\\r\\n\`); };
  write("220", "mock-smtp-ready");
  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    while (true) {
      const idx = buffer.indexOf("\\r\\n");
      if (idx === -1) break;
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (inData) {
        if (line === ".") {
          inData = false;
          writeFileSync(capturePath, message, { mode: 0o600 });
          write("250", "OK");
        } else {
          message += (line.startsWith(".") ? line.slice(1) : line) + "\\n";
        }
        continue;
      }
      const upper = line.toUpperCase();
      if (upper.startsWith("EHLO") || upper.startsWith("HELO")) write("250", "mock-smtp");
      else if (upper.startsWith("MAIL FROM")) write("250", "OK");
      else if (upper.startsWith("RCPT TO")) write("250", "OK");
      else if (upper.startsWith("DATA")) { inData = true; message = ""; write("354", "Start mail input"); }
      else if (upper.startsWith("QUIT")) { write("221", "Bye"); socket.end(); }
      else if (upper.startsWith("AUTH")) write("235", "2.7.0 Authentication successful");
      else write("250", "OK");
    }
  });
});
server.listen(1025, "0.0.0.0", () => { console.log("mock-smtp-listening"); });
`;
    const scriptPath = path.join(captureDir, "smtp-sink.mjs");
    await writeFile(scriptPath, smtpScript, { mode: 0o600 });
    const smtpContainer = `${project}-smtp-sink`;
    run("docker", [
      "run", "-d", "--name", smtpContainer, "--network", networkName,
      "--user", "1000:1000",
      "-v", `${captureDir}:/mail`, "--restart", "no",
      "node:26.4.0-bookworm-slim@sha256:ec82d089a8ae2cf02628da7b34ea57dc357b24db724d557fe2d240e6beb659c1",
      "node", "/mail/smtp-sink.mjs",
    ]);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const logs = run("docker", ["logs", smtpContainer]).trim();
      if (logs.includes("mock-smtp-listening")) return smtpContainer;
      await delay(500);
    }
    throw new Error("mock SMTP sink did not start");
  }
  async function readSmtpCapture(captureDir) {
    const captureFile = path.join(captureDir, "captured.eml");
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const text = await readFile(captureFile, "utf8");
        if (text.length > 0) return text;
      } catch {
        // not yet written
      }
      await delay(500);
    }
    throw new Error("mock SMTP capture timed out");
  }
  function extractResetToken(emailText) {
    // The capture is raw MIME: quoted-printable soft line breaks ("=\n") split
    // the reset URL, so unfold them before matching.
    const unfolded = emailText.replace(/=\r?\n/g, "");
    const match = unfolded.match(/\/reset-password\?token=([A-Za-z0-9_-]+)/);
    assert(match && match[1], "reset token not found in captured email");
    return match[1];
  }
  async function createFixtureImage(appId, hostPath) {
    run("docker", ["exec", appId, "node", "-e", 'const sharp=require("sharp"); sharp({create:{width:100,height:100,channels:3,background:"#ff0000"}}).webp().toBuffer().then(b=>require("node:fs").writeFileSync("/tmp/fixture-logo.webp", b))']);
    run("docker", ["cp", `${appId}:/tmp/fixture-logo.webp`, hostPath]);
  }

  let scenarioFailed = false;
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
      const secretNames = (service) => new Set((model.services[service].secrets ?? []).map((entry) => entry.source));
      assert(secretNames("db").size === 1 && secretNames("db").has("postgres_admin_password"), "DB secret grant changed");
      const appSecrets = secretNames("app");
      for (const secret of ["runtime_password", "nautt_encryption_key", "smtp_host", "smtp_port", "smtp_user", "smtp_password", "smtp_from", "smtp_tls_mode", "public_origin"]) {
        assert(appSecrets.has(secret), `app secret missing: ${secret}`);
      }
      const appEnv = model.services.app.environment;
      for (const variable of ["SMTP_HOST_FILE", "SMTP_PORT_FILE", "SMTP_USER_FILE", "SMTP_PASSWORD_FILE", "SMTP_FROM_FILE", "SMTP_TLS_MODE_FILE", "PUBLIC_ORIGIN_FILE"]) {
        assert(typeof appEnv[variable] === "string" && appEnv[variable].startsWith("/run/secrets/"), `app env missing or invalid: ${variable}`);
      }
      for (const target of ["smtp_host", "smtp_port", "smtp_user", "smtp_password", "smtp_from", "smtp_tls_mode", "public_origin"]) {
        const stagedPath = path.join(staged, target);
        const stagedInfo = await stat(stagedPath);
        assert(stagedInfo.uid === 1000 && stagedInfo.gid === 1000 && (stagedInfo.mode & 0o777) === 0o400, `staged identity/mode invalid: ${target}`);
      }
      console.log("PASS source-secret-permissions");
      console.log("PASS staged-secret-permissions");
      console.log("PASS smtp-public-origin-staged-permissions");
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
      for (const secret of ["smtp_host", "smtp_port", "smtp_user", "smtp_password", "smtp_from", "smtp_tls_mode", "public_origin"]) {
        assert(appMounts.includes(secret), `app secret mount missing: ${secret}`);
      }
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
    } else if (scenario === "media") {
      assert(process.env.CONTAINER_TEST_CLEAN_CLONE === "1", "media scenario requires --clean-clone");
      const { appId } = await startHappy();
      const mount = inspectField(appId, '{{range .Mounts}}{{if eq .Destination "/app/media"}}{{.Name}}|{{.RW}}{{end}}{{end}}');
      assert(mount === `${project}_media-data|true`, "steady app media mount is not the exact RW volume");
      assert(
        run("docker", ["exec", appId, "stat", "-c", "%u:%g:%a", "/app/media", "/app/media/staging", "/app/media/objects"])
          .trim().split("\n").every((entry) => entry === "1000:1000:700"),
        "media control directory identity changed",
      );
      const rootWrite = execute("docker", ["exec", appId, "sh", "-c", "touch /app/root-write-probe"]);
      assert(rootWrite.status !== 0, "read-only application root accepted a write");
      run("docker", ["exec", appId, "node", "-e", 'require("node:fs").writeFileSync("/app/media/staging/.restart-sentinel","persisted")']);
      compose(["restart", "app"]);
      const restarted = await waitForApp();
      assert(
        run("docker", ["exec", restarted, "node", "-e", 'process.stdout.write(require("node:fs").readFileSync("/app/media/staging/.restart-sentinel","utf8"))']).trim() === "persisted",
        "media sentinel did not survive application restart",
      );
      run("docker", ["exec", restarted, "rm", "/app/media/staging/.restart-sentinel"]);
      const unavailable = await get(`/media/${"A".repeat(43)}`);
      assert(unavailable.status === 404, "unavailable media response changed");
      const appImage = inspectField(restarted, "{{.Image}}");
      run("docker", [
        "run", "--rm", "--pull=never", "--network", "none", "--read-only", "--tmpfs", "/tmp",
        "--user", "1000:1000", "--volume", `${project}_media-data:/app/media`,
        "--entrypoint", "node", appImage, "container/media-preflight.mjs",
      ]);
      const probeResidue = run("docker", [
        "run", "--rm", "--pull=never", "--network", "none", "--read-only", "--tmpfs", "/tmp",
        "--user", "1000:1000", "--volume", `${project}_media-data:/app/media:ro`,
        "--entrypoint", "node", appImage, "-e",
        'const f=require("node:fs");const e=[...f.readdirSync("/app/media/staging"),...f.readdirSync("/app/media/objects")].filter(n=>n.includes("probe"));process.stdout.write(String(e.length))',
      ]).trim();
      assert(probeResidue === "0", "media helper left probe residue");
      console.log("PASS media-volume-runtime");
      console.log("PASS media-read-only-root");
      console.log("PASS media-restart-persistence");
      console.log("PASS media-helper-cleanup");
    } else if (scenario === "media-backup" || scenario === "media-restore") {
      assert(process.env.CONTAINER_TEST_CLEAN_CLONE === "1", `${scenario} requires --clean-clone`);
      const revision = run("git", ["rev-parse", "HEAD"]).trim();
      const sourceDirectory = path.resolve(".install-secrets");
      const stagedDirectory = path.resolve(".container-secrets");
      const installerEnv = path.join(temporary, "pair.env");
      const pairAppPort = 36000 + (process.pid % 1000);
      await writeFile(installerEnv, `APP_PORT=${pairAppPort}
INITIAL_ADMIN_USERNAME=admin.user
INITIAL_ADMIN_EMAIL=admin@example.com
POSTGRES_ADMIN_PASSWORD=${values.admin}
MIGRATOR_PASSWORD=${values.migrator}
RUNTIME_PASSWORD=${values.runtime}
NAUTT_ENCRYPTION_KEY=${values.nautt}
NAUTT_WEBHOOK_CALLBACK_URL=https://container-test.invalid/api/nautt/webhooks
SMTP_HOST=${values.smtpHost}
SMTP_PORT=${values.smtpPort}
SMTP_USER=${values.smtpUser}
SMTP_PASSWORD=${values.smtpPassword}
SMTP_FROM=${values.smtpFrom}
SMTP_TLS_MODE=${values.smtpTlsMode}
PUBLIC_ORIGIN=${values.publicOrigin}
`, { mode: 0o600 });
      await chmod(installerEnv, 0o600);
      const destination = path.join(temporary, "backups");
      await mkdir(destination, { mode: 0o700 });
      const processEnv = { ...process.env, CONTAINER_TEST_PROJECT: project };
      const installed = execute("install/install.sh", ["--env-file", installerEnv], { env: processEnv });
      assert(installed.status === 0, `normal install failed\n${installed.stdout ?? ""}${installed.stderr ?? ""}`);
      assert(`${installed.stdout ?? ""}${installed.stderr ?? ""}`.includes("PASS install-complete"), "normal install evidence missing");
      const installedApp = await waitForApp();
      assert(
        inspectField(installedApp, '{{index .Config.Labels "org.opencontainers.image.revision"}}') === revision,
        "normal install did not bind the exact revision",
      );
      env.APP_IMAGE = inspectField(installedApp, "{{.Config.Image}}");
      env.DB_OPS_IMAGE = `${project}-db-ops:${revision}`;
      env.RELEASE_REVISION = revision;
      env.APP_PORT = String(pairAppPort);
      env.POSTGRES_ADMIN_PASSWORD_FILE = path.join(sourceDirectory, "postgres_admin_password");
      env.MIGRATOR_PASSWORD_FILE = path.join(sourceDirectory, "migrator_password");
      env.RUNTIME_PASSWORD_FILE = path.join(sourceDirectory, "runtime_password");
      env.INITIAL_ADMIN_USERNAME_FILE = path.join(stagedDirectory, "initial_admin_username");
      env.INITIAL_ADMIN_EMAIL_FILE = path.join(stagedDirectory, "initial_admin_email");
      env.INITIAL_ADMIN_PASSWORD_FILE = path.join(stagedDirectory, "initial_admin_password");
      env.STAGED_SECRETS_DIR = stagedDirectory;

      const storageKey = "A".repeat(43);
      const identifier = "B".repeat(43);
      const mediaBytes = Buffer.from("restorable-media-fixture");
      const mediaDigest = createHash("sha256").update(mediaBytes).digest("hex");
      run("docker", [
        "run", "--rm", "--network", "none", "--read-only", "--tmpfs", "/tmp",
        "--user", "1000:1000", "--volume", `${project}_media-data:/app/media`,
        "--entrypoint", "node", env.APP_IMAGE, "-e",
        `require("node:fs").writeFileSync("/app/media/objects/${storageKey}.webp",Buffer.from("${mediaBytes.toString("base64")}","base64"),{mode:0o600,flag:"wx"})`,
      ]);
      const dbId = compose(["ps", "-q", "db"]).trim();
      run("docker", ["exec", dbId, "psql", "-p", "5433", "-U", "postgres", "-d", "qr_pagamentos", "-v", "ON_ERROR_STOP=1", "-c",
        `INSERT INTO app.media_object (id,identifier,storage_key,owner_id,purpose,state,lifecycle_revision,mime_type,byte_size,width,height,sha256,purge_after,created_at,updated_at) SELECT gen_random_uuid(),'${identifier}','${storageKey}',initial_admin_user_id,'PRODUCT_IMAGE','ACTIVE',0,'image/webp',${mediaBytes.length},1,1,'${mediaDigest}',NULL,now(),now() FROM app.deployment_bootstrap WHERE id=1`]);
      const backup = execute("install/backup.sh", ["--env-file", installerEnv, "--destination", destination], { env: processEnv });
      const backupOutput = `${backup.stdout ?? ""}${backup.stderr ?? ""}`;
      assert(backup.status === 0, `media backup failed\n${backupOutput}`);
      const backupSet = backupOutput.match(/PASS media-backup set=(.+)/)?.[1]?.trim();
      assert(backupSet, "media backup set evidence missing");
      const manifest = JSON.parse(await readFile(path.join(backupSet, "manifest.json"), "utf8"));
      assert(
        manifest.application_revision === revision
        && manifest.compose_project === project
        && manifest.application_image === `${project}-app:${revision}`
        && manifest.database_operations_image === `${project}-db-ops:${revision}`,
        "backup manifest exact image identity changed",
      );
      for (const secret of Object.values(values)) {
        assert(!JSON.stringify(manifest).includes(secret), "backup manifest leaked a protected value");
      }
      console.log("PASS media-backup-pair");
      if (scenario === "media-restore") {
        const restore = (set, confirm = `RESTORE:${project}`, injection = "") => execute(
          "install/restore.sh",
          ["--env-file", installerEnv, "--backup", set, "--confirm", confirm],
          {
            env: {
              ...processEnv,
              DB_OPS_IMAGE: `${project}-db-ops:fixture`,
              CONTAINER_TEST_OPERATOR_UID: "2001",
              CONTAINER_TEST_RESTORE_INJECT: injection,
            },
          },
        );
        const copySet = async (name) => {
          const target = path.join(temporary, name);
          await mkdir(target, { mode: 0o700 });
          for (const artifact of ["manifest.json", "database.dump", "media.tar"]) {
            await copyFile(path.join(backupSet, artifact), path.join(target, artifact));
            await chmod(path.join(target, artifact), 0o600);
          }
          return target;
        };
        const rewriteManifest = async (set, change) => {
          const file = path.join(set, "manifest.json");
          const value = JSON.parse(await readFile(file, "utf8"));
          change(value);
          await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
          await chmod(file, 0o600);
        };
        const refreshMediaArtifact = async (set) => {
          const mediaFile = path.join(set, "media.tar");
          await chmod(mediaFile, 0o600);
          await rewriteManifest(set, (value) => {
            value.media.bytes = 0;
            value.media.sha256 = "0".repeat(64);
          });
          const value = JSON.parse(await readFile(path.join(set, "manifest.json"), "utf8"));
          value.media.bytes = (await stat(mediaFile)).size;
          value.media.sha256 = createHash("sha256").update(await readFile(mediaFile)).digest("hex");
          await writeFile(path.join(set, "manifest.json"), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
          await chmod(path.join(set, "manifest.json"), 0o600);
        };
        const snapshot = () => ({
          app: compose(["ps", "-q", "app"]).trim(),
          dbVolume: run("docker", ["volume", "inspect", "--format", "{{.Name}}|{{.CreatedAt}}", `${project}_postgres-data`]).trim(),
          mediaVolume: run("docker", ["volume", "inspect", "--format", "{{.Name}}|{{.CreatedAt}}", `${project}_media-data`]).trim(),
        });
        const assertRehearsalAbsent = async () => {
          for (const [kind, args] of [
            ["container", ["ps", "-a", "--format", "{{.Names}}"]],
            ["network", ["network", "ls", "--format", "{{.Name}}"]],
            ["volume", ["volume", "ls", "--format", "{{.Name}}"]],
          ]) {
            const leaked = run("docker", args).split("\n").filter((name) => name.startsWith(`${project}-restore-`));
            assert(leaked.length === 0, `${kind} rehearsal inventory remained: ${leaked.join(",")}`);
          }
          const leakedSecrets = (await readdir(destination)).filter((name) => name.endsWith("-secrets"));
          assert(leakedSecrets.length === 0, `rehearsal secret inventory remained: ${leakedSecrets.join(",")}`);
        };
        const baseline = snapshot();

        assert(restore(backupSet, "RESTORE:wrong").status !== 0, "wrong confirmation succeeded");
        for (const [name, change] of [
          ["wrong-sha", (value) => { value.application_revision = "b".repeat(40); }],
          ["wrong-schema", (value) => { value.schema_expectation = "unsupported"; }],
          ["wrong-project", (value) => { value.compose_project = `${project}x`; }],
          ["wrong-volume", (value) => { value.media_volume = `${project}_foreign`; }],
          ["wrong-checksum", (value) => { value.media.sha256 = "0".repeat(64); }],
        ]) {
          const set = await copySet(name);
          await rewriteManifest(set, change);
          assert(restore(set).status !== 0, `${name} restore succeeded`);
        }

        const unsafeMode = await copySet("unsafe-mode");
        const unsafeRoot = path.join(temporary, "unsafe-root");
        await mkdir(unsafeRoot, { mode: 0o700 });
        run("tar", ["-xf", path.join(unsafeMode, "media.tar"), "-C", unsafeRoot]);
        await chmod(path.join(unsafeRoot, "objects", `${storageKey}.webp`), 0o777);
        run("tar", ["--numeric-owner", "-C", unsafeRoot, "-cpf", path.join(unsafeMode, "media.tar"), "."]);
        await refreshMediaArtifact(unsafeMode);
        assert(restore(unsafeMode).status !== 0, "unsafe member mode succeeded");

        const unsafeMember = await copySet("unsafe-member");
        const unsafeMemberRoot = path.join(temporary, "unsafe-member-root");
        await mkdir(unsafeMemberRoot, { mode: 0o700 });
        run("tar", ["-xf", path.join(unsafeMember, "media.tar"), "-C", unsafeMemberRoot]);
        run("ln", ["-s", `${storageKey}.webp`, path.join(unsafeMemberRoot, "objects", `${"C".repeat(43)}.webp`)]);
        run("tar", ["--numeric-owner", "-C", unsafeMemberRoot, "-cpf", path.join(unsafeMember, "media.tar"), "."]);
        await refreshMediaArtifact(unsafeMember);
        assert(restore(unsafeMember).status !== 0, "unsafe archive member succeeded");

        const digestSet = await copySet("digest-mismatch");
        const digestRoot = path.join(temporary, "digest-root");
        await mkdir(digestRoot, { mode: 0o700 });
        run("tar", ["-xf", path.join(digestSet, "media.tar"), "-C", digestRoot]);
        await writeFile(path.join(digestRoot, "objects", `${storageKey}.webp`), Buffer.alloc(mediaBytes.length, 88), { mode: 0o600 });
        run("tar", ["--numeric-owner", "-C", digestRoot, "-cpf", path.join(digestSet, "media.tar"), "."]);
        await refreshMediaArtifact(digestSet);
        assert(restore(digestSet).status !== 0, "media digest mismatch succeeded");

        const untrackedSet = await copySet("untracked-media");
        const untrackedRoot = path.join(temporary, "untracked-root");
        await mkdir(untrackedRoot, { mode: 0o700 });
        run("tar", ["-xf", path.join(untrackedSet, "media.tar"), "-C", untrackedRoot]);
        await writeFile(
          path.join(untrackedRoot, "objects", `${"D".repeat(43)}.webp`),
          "untracked",
          { mode: 0o600 },
        );
        run("tar", ["--numeric-owner", "-C", untrackedRoot, "-cpf", path.join(untrackedSet, "media.tar"), "."]);
        await refreshMediaArtifact(untrackedSet);
        assert(restore(untrackedSet).status !== 0, "untracked media member succeeded");

        const teardown = restore(backupSet, `RESTORE:${project}`, "rehearsal-teardown");
        assert(teardown.status !== 0, "injected rehearsal teardown refusal succeeded");
        assert(JSON.stringify(snapshot()) === JSON.stringify(baseline), "teardown refusal touched the managed target");
        await assertRehearsalAbsent();

        const recovered = restore(backupSet, `RESTORE:${project}`, "primary-after-mutation");
        assert(recovered.status !== 0, "injected primary restore failure reported success");
        assert(
          `${recovered.stdout ?? ""}${recovered.stderr ?? ""}`.includes("original pair recovered"),
          `primary failure did not report recovery\n${recovered.stdout ?? ""}${recovered.stderr ?? ""}`,
        );
        await waitForApp();
        await assertRehearsalAbsent();

        const doubleFailure = restore(backupSet, `RESTORE:${project}`, "primary-after-mutation,recovery-after-mutation");
        const doubleOutput = `${doubleFailure.stdout ?? ""}${doubleFailure.stderr ?? ""}`;
        assert(doubleFailure.status !== 0 && doubleOutput.includes("DOUBLEFAIL"), "double restore failure contract changed");
        assert(doubleOutput.includes("operator_uid=2001 container_uid=1000"), "non-1000 operator staging proof missing");
        assert(compose(["ps", "-q", "app"]).trim() === "", "double failure left the application running");
        assert((await readdir(destination)).some((entry) => entry.includes("-recovery")), "double failure removed recovery artifacts");
        await assertRehearsalAbsent();
        const recoveryMigrate = `${project}-restore-recovery-migrate-${process.pid}`;
        compose(["run", "--name", recoveryMigrate, "--no-deps", "migrate"]);
        assert(inspectField(recoveryMigrate, "{{.State.ExitCode}}") === "0", "double-failure pair did not pass exact-release migration proof");
        assert(
          run("docker", ["exec", compose(["ps", "-q", "db"]).trim(), "psql", "-p", "5433", "-U", "postgres", "-d", "qr_pagamentos", "-Atc",
            "SELECT count(*) FROM app._prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL"]).trim() === "0",
          "double-failure pair retained invalid migration metadata",
        );
        compose(["run", "--rm", "--no-deps", "identity-seed"]);
        compose(["up", "-d", "--no-deps", "app"]);
        await waitForApp();

        const restored = execute("install/restore.sh", ["--env-file", installerEnv, "--backup", backupSet, "--confirm", `RESTORE:${project}`], { env: processEnv });
        assert(restored.status === 0, `media restore failed\n${restored.stdout ?? ""}${restored.stderr ?? ""}`);
        assert(`${restored.stdout ?? ""}${restored.stderr ?? ""}`.includes("PASS media-restore"), "restore evidence missing");
        await waitForApp();
        await assertRehearsalAbsent();
        console.log("PASS media-restore-rehearsal");
        console.log("PASS media-restore-managed-pair");
        console.log("PASS media-restore-adversaries");
        console.log("PASS media-restore-automatic-recovery");
        console.log("PASS media-restore-double-failure");
      }
      await rm(sourceDirectory, { recursive: true, force: true });
      await rm(stagedDirectory, { recursive: true, force: true });
    } else if (scenario === "install-lifecycle") {
      assert(process.env.CONTAINER_TEST_CLEAN_CLONE === "1", "install lifecycle requires --clean-clone");
      await prepare();
      const installerEnv = path.join(temporary, "install-lifecycle.env");
      const sourceKey = Buffer.alloc(32, 19).toString("base64url");
      const appPort = 34000 + (process.pid % 1000);
      const writeInstallerEnv = async (runtimePassword = values.runtime) => {
        await writeFile(installerEnv, `APP_PORT=${appPort}
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_USERNAME=admin.user
POSTGRES_ADMIN_PASSWORD=${values.admin}
MIGRATOR_PASSWORD=${values.migrator}
RUNTIME_PASSWORD=${runtimePassword}
NAUTT_ENCRYPTION_KEY=${sourceKey}
NAUTT_WEBHOOK_CALLBACK_URL=https://payments.example.com/api/nautt/webhooks
SMTP_HOST=${values.smtpHost}
SMTP_PORT=${values.smtpPort}
SMTP_USER=${values.smtpUser}
SMTP_PASSWORD=${values.smtpPassword}
SMTP_FROM=${values.smtpFrom}
SMTP_TLS_MODE=${values.smtpTlsMode}
PUBLIC_ORIGIN=${values.publicOrigin}
`, { mode: 0o600 });
        await chmod(installerEnv, 0o600);
      };
      const invokeLifecycle = (script, args) => {
        const result = execute(script, args, { env: { ...process.env, CONTAINER_TEST_PROJECT: project } });
        const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
        assertRedacted(output);
        assert(!output.includes(sourceKey), "lifecycle leaked Nautt key");
        return { result, output };
      };
      const volumeId = (logical) => run("docker", [
        "volume", "inspect", "--format", "{{.Name}}|{{.CreatedAt}}",
        `${project}_${logical}`,
      ]).trim();
      const digest = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");

      await writeInstallerEnv();
      let invocation = invokeLifecycle("install/install.sh", ["--env-file", installerEnv]);
      assert(invocation.result.status === 0, `fresh install failed\n${invocation.output}`);
      const dbVolume = volumeId("postgres-data");
      const mediaVolume = volumeId("media-data");
      const sourceRuntime = await digest(path.resolve(".install-secrets", "runtime_password"));
      const stagedRuntime = await digest(path.resolve(".container-secrets", "runtime_password"));
      assert(invocation.output.includes("PASS install-media-preflight"), "fresh media preflight evidence missing");

      invocation = invokeLifecycle("install/uninstall.sh", ["--env-file", installerEnv]);
      assert(invocation.result.status === 0 && invocation.output.includes("PASS uninstall-retained-pair"), "default uninstall did not retain pair");
      assert(volumeId("postgres-data") === dbVolume && volumeId("media-data") === mediaVolume, "default uninstall changed volume identities");
      assert(await digest(path.resolve(".install-secrets", "runtime_password")) === sourceRuntime, "default uninstall changed source credential");
      assert(await digest(path.resolve(".container-secrets", "runtime_password")) === stagedRuntime, "default uninstall changed staged credential");

      await writeInstallerEnv(`mismatch-${values.runtime}`);
      invocation = invokeLifecycle("install/install.sh", ["--env-file", installerEnv]);
      assert(invocation.result.status !== 0, "retained credential mismatch succeeded");
      assert(compose(["ps", "-q", "db"]).trim() === "", "credential mismatch started the database");
      await writeInstallerEnv();

      run("docker", ["volume", "rm", `${project}_media-data`]);
      invocation = invokeLifecycle("install/install.sh", ["--env-file", installerEnv]);
      assert(invocation.result.status === 0 && invocation.output.includes("PASS legacy-media-volume-adopted"), "zero-row legacy adoption failed");
      assert(volumeId("postgres-data") === dbVolume, "legacy adoption changed PostgreSQL volume identity");
      const adoptedMedia = volumeId("media-data");
      assert(adoptedMedia !== mediaVolume, "legacy adoption did not create a new media volume");

      invocation = invokeLifecycle("install/uninstall.sh", ["--env-file", installerEnv]);
      assert(invocation.result.status === 0, "pre-purge default uninstall failed");
      invocation = invokeLifecycle("install/uninstall.sh", ["--purge-data", project, "--env-file", installerEnv]);
      assert(invocation.result.status === 0 && invocation.output.includes("PASS uninstall-purged-pair"), "confirmed paired purge failed");
      for (const logical of ["postgres-data", "media-data"]) {
        assert(execute("docker", ["volume", "inspect", `${project}_${logical}`]).status !== 0, `purge retained ${logical}`);
      }
      console.log("PASS install-lifecycle-retention");
      console.log("PASS install-lifecycle-credential-continuity");
      console.log("PASS install-lifecycle-zero-row-adoption");
      console.log("PASS install-lifecycle-paired-purge");
    } else if (scenario === "update") {
      assert(process.env.CONTAINER_TEST_CLEAN_CLONE === "1", "update scenario requires --clean-clone");
      const installerEnv = path.join(temporary, "update.env");
      const evidenceDirectory = path.join(temporary, "update-evidence");
      const sourceKey = Buffer.alloc(32, 11).toString("base64url");
      const updateAppPort = 35000 + (process.pid % 1000);
      const branch = run("git", ["branch", "--show-current"]).trim();
      const updateRemote = path.join(temporary, "update-remote.git");
      await run("git", ["init", "--bare", updateRemote]);
      run("git", ["push", updateRemote, `HEAD:refs/heads/${branch}`]);
      run("git", ["remote", "set-url", "origin", updateRemote]);
      const originalBootstrap = await readFile("prisma/bootstrap.sql", "utf8");
      const originalIdentitySeed = await readFile("container/identity-admin.mjs", "utf8");
      const originalRuntime = await readFile("container/runtime.mjs", "utf8");
      const publishFileChange = async (label, file, content) => {
        const producer = path.join(temporary, `update-producer-${label}`);
        run("git", ["clone", "--quiet", "--branch", branch, updateRemote, producer]);
        run("git", ["config", "user.email", "container-test@example.invalid"], { cwd: producer });
        run("git", ["config", "user.name", "Container Test"], { cwd: producer });
        await writeFile(path.join(producer, file), content);
        run("git", ["add", file], { cwd: producer });
        run("git", ["commit", "-m", `test: ${label}`], { cwd: producer });
        run("git", ["push", "origin", branch], { cwd: producer });
      };
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
      await writeFile(installerEnv, `APP_PORT=${updateAppPort}
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_USERNAME=admin.user
POSTGRES_ADMIN_PASSWORD=${values.admin}
MIGRATOR_PASSWORD=${values.migrator}
RUNTIME_PASSWORD=${values.runtime}
NAUTT_ENCRYPTION_KEY=${sourceKey}
NAUTT_WEBHOOK_CALLBACK_URL=https://payments.example.com/api/nautt/webhooks
SMTP_HOST=${values.smtpHost}
SMTP_PORT=${values.smtpPort}
SMTP_USER=${values.smtpUser}
SMTP_PASSWORD=${values.smtpPassword}
SMTP_FROM=${values.smtpFrom}
SMTP_TLS_MODE=${values.smtpTlsMode}
PUBLIC_ORIGIN=${values.publicOrigin}
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
        if (!output) {
          for (const service of ["bootstrap", "identity-seed"]) {
            const id = containerId(service);
            assert(id && inspectField(id, "{{.State.ExitCode}}") === "0", `${service} install gate failed`);
          }
        }
        const logs = compose(["logs", "--no-color"]);
        assert(logs.includes("PASS bootstrap") && logs.includes("PASS identity-seed"), "one-shot update evidence missing");
        if (output) assert(output.includes("PASS migration-complete") && output.includes("PASS update-complete"), "fresh migration completion evidence missing");
        assert(logs.includes("PASS runtime-db-preflight"), "update runtime preflight evidence missing");
        let health;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          try {
            health = await get("/api/health");
            if (health.status === 200 && health.body === '{"status":"ok"}') break;
          } catch {
            // A force-recreated app may close the old listener between port lookup and connect.
          }
          await delay(500);
        }
        assert(health?.status === 200 && health.body === '{"status":"ok"}', "update exact health contract failed");
        assertRedacted(logs);
      };

      captured += invoke("install/install.sh", ["--env-file", installerEnv]);
      await assertUpdateStartup();
      const sourceKeyPath = path.resolve(".install-secrets", "nautt_encryption_key");
      const stagedKeyPath = path.resolve(".container-secrets", "nautt_encryption_key");
      const volumeIdentity = run("docker", ["volume", "inspect", "--format", "{{.Name}}|{{.Mountpoint}}|{{.CreatedAt}}", `${project}_postgres-data`]).trim();
      const mediaVolumeIdentity = run("docker", ["volume", "inspect", "--format", "{{.Name}}|{{.CreatedAt}}", `${project}_media-data`]).trim();
      run("docker", ["exec", containerId("app"), "node", "-e", 'require("node:fs").writeFileSync("/app/media/staging/.update-fixture", "media-sentinel")']);
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
        assert(run("docker", ["volume", "inspect", "--format", "{{.Name}}|{{.CreatedAt}}", `${project}_media-data`]).trim() === mediaVolumeIdentity, "update changed media volume identity");
        assert(run("docker", ["exec", appId, "node", "-e", 'process.stdout.write(require("node:fs").readFileSync("/app/media/staging/.update-fixture", "utf8"))']).trim() === "media-sentinel", "update changed media bytes");
        assert(await digest(sourceKeyPath) === sourceDigest, "update changed source Nautt key");
        assert(await digest(stagedKeyPath) === stagedDigest, "update changed staged Nautt key");
      }
      assert(migrateIds[0] !== migrateIds[1], "no-op update reused the migration container");
      const failedUpdate = async (gate, service, expectedCode) => {
        const previousApp = containerId("app");
        const previousImage = inspectField(previousApp, "{{.Image}}");
        const evidenceBefore = new Set(await readdir(evidenceDirectory));
        const result = execute("install/update.sh", updateArgs, { env: updateProcessEnv });
        const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
        assert(result.status !== 0, `forced ${gate} failure succeeded`);
        assertRedacted(output);
        assert(!output.includes(sourceKey), `${gate} failure leaked Nautt key`);
        const evidenceAfter = (await readdir(evidenceDirectory)).filter((name) => !evidenceBefore.has(name));
        assert(evidenceAfter.length === 1, `${gate} failure did not retain one evidence file`);
        const evidenceFile = path.join(evidenceDirectory, evidenceAfter[0]);
        const evidenceText = await readFile(evidenceFile, "utf8");
        assert(evidenceText.includes(`result=${gate}-failed`), `${gate} failure result missing`);
        assert(evidenceText.includes("previous_app_proof=exact-container-image-healthy-volumes-unchanged"), `${gate} old-app proof missing`);
        assert(((await stat(evidenceFile)).mode & 0o777) === 0o400, `${gate} evidence mode changed`);
        const helper = evidenceText.match(/^failed_helper=(.+)$/m)?.[1];
        assert(helper?.includes(`-update-${service}-`), `${gate} retained helper identity missing`);
        assert(inspectField(helper, "{{.State.ExitCode}}") !== "0", `${gate} retained helper did not fail`);
        const helperLogs = run("docker", ["logs", helper]);
        assert(helperLogs.includes(expectedCode), `${gate} retained helper logs lack stable failure code`);
        assertRedacted(helperLogs);
        assert(containerId("app") === previousApp, `${gate} failure replaced the previous app`);
        assert(inspectField(previousApp, "{{.Image}}") === previousImage, `${gate} failure changed the previous app image`);
        assert(inspectField(previousApp, "{{.State.Health.Status}}") === "healthy", `${gate} failure damaged previous app health`);
      };
      const envelopeFailure = async (injection, expectedResult, sameContainer) => {
        const previousApp = containerId("app");
        const previousImage = inspectField(previousApp, "{{.Image}}");
        const evidenceBefore = new Set(await readdir(evidenceDirectory));
        const result = execute("install/update.sh", updateArgs, {
          env: { ...updateProcessEnv, CONTAINER_TEST_UPDATE_INJECT: injection },
        });
        const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
        assert(result.status !== 0, `forced ${injection} failure succeeded`);
        assertRedacted(output);
        assert(!output.includes(sourceKey), `${injection} failure leaked Nautt key`);
        const evidenceAfter = (await readdir(evidenceDirectory)).filter((name) => !evidenceBefore.has(name));
        assert(evidenceAfter.length === 1, `${injection} did not retain one evidence file`);
        const evidenceFile = path.join(evidenceDirectory, evidenceAfter[0]);
        const evidenceText = await readFile(evidenceFile, "utf8");
        assert(evidenceText.includes(expectedResult), `${injection} sealed result missing\n${evidenceText}`);
        assert(((await stat(evidenceFile)).mode & 0o777) === 0o400, `${injection} evidence mode changed`);
        const currentApp = containerId("app");
        if (sameContainer) assert(currentApp === previousApp, `${injection} replaced the pre-promotion app`);
        assert(inspectField(currentApp, "{{.Image}}") === previousImage, `${injection} did not preserve exact previous image`);
        assert(inspectField(currentApp, "{{.State.Health.Status}}") === "healthy", `${injection} did not preserve or restore health`);
        assert(run("docker", ["volume", "inspect", "--format", "{{.Name}}|{{.Mountpoint}}|{{.CreatedAt}}", `${project}_postgres-data`]).trim() === volumeIdentity, `${injection} changed PostgreSQL volume identity`);
        assert(run("docker", ["volume", "inspect", "--format", "{{.Name}}|{{.CreatedAt}}", `${project}_media-data`]).trim() === mediaVolumeIdentity, `${injection} changed media volume identity`);
      };

      await envelopeFailure("candidate-preflight", "result=candidate-preflight-failed", true);
      captured += invoke("install/update.sh", updateArgs);
      await assertUpdateStartup(captured);
      await envelopeFailure("target-recreate", "result=target-recreate-failed-previous-image-healthy", false);
      captured += invoke("install/update.sh", updateArgs);
      await assertUpdateStartup(captured);

      await publishFileChange("force-bootstrap-failure", "prisma/bootstrap.sql", `${originalBootstrap}\nINVALID UPDATE BOOTSTRAP;\n`);
      await failedUpdate("bootstrap", "bootstrap", "ERROR bootstrap code=42601");
      await publishFileChange("repair-bootstrap", "prisma/bootstrap.sql", originalBootstrap);
      captured += invoke("install/update.sh", updateArgs);
      await assertUpdateStartup(captured);

      await publishFileChange(
        "force-identity-seed-failure",
        "container/identity-admin.mjs",
        originalIdentitySeed.replace(
          "async function seed() {",
          'async function seed() { throw Object.assign(new Error("forced identity seed failure"), { code: "FORCED" });',
        ),
      );
      await failedUpdate("identity-seed", "identity-seed", "ERROR identity-admin code=FORCED");
      await publishFileChange("repair-identity-seed", "container/identity-admin.mjs", originalIdentitySeed);
      captured += invoke("install/update.sh", updateArgs);
      await assertUpdateStartup(captured);

      const rollbackImage = inspectField(containerId("app"), "{{.Image}}");
      const evidenceBeforeRollback = new Set(await readdir(evidenceDirectory));
      await publishFileChange(
        "force-target-health-failure",
        "container/runtime.mjs",
        `throw new Error("forced target health failure");\n${originalRuntime}`,
      );
      const targetFailure = execute("install/update.sh", updateArgs, { env: updateProcessEnv });
      const targetFailureOutput = `${targetFailure.stdout ?? ""}${targetFailure.stderr ?? ""}`;
      assert(targetFailure.status !== 0, "forced target health failure succeeded");
      assertRedacted(targetFailureOutput);
      assert(!targetFailureOutput.includes(sourceKey), "target health failure leaked Nautt key");
      const rollbackEvidence = (await readdir(evidenceDirectory)).filter((name) => !evidenceBeforeRollback.has(name));
      assert(rollbackEvidence.length === 1, "target health failure did not retain one evidence file");
      const rollbackEvidenceFile = path.join(evidenceDirectory, rollbackEvidence[0]);
      const rollbackEvidenceText = await readFile(rollbackEvidenceFile, "utf8");
      assert(rollbackEvidenceText.includes("result=target-health-failed-previous-image-healthy"), "target rollback evidence missing");
      assert(((await stat(rollbackEvidenceFile)).mode & 0o777) === 0o400, "target rollback evidence mode changed");
      const rolledBackApp = containerId("app");
      assert(inspectField(rolledBackApp, "{{.Image}}") === rollbackImage, "target health failure did not restore exact previous image");
      assert(inspectField(rolledBackApp, "{{.State.Health.Status}}") === "healthy", "target rollback did not restore health");
      await publishFileChange("repair-target-health", "container/runtime.mjs", originalRuntime);
      captured += invoke("install/update.sh", updateArgs);
      await assertUpdateStartup(captured);

      const currentApp = containerId("app");
      const currentImage = inspectField(currentApp, "{{.Image}}");
      const currentHealth = inspectField(currentApp, "{{.State.Health.Status}}");
      const dbId = containerId("db");
      const dataBeforeFailure = run("docker", ["exec", dbId, "psql", "-p", "5433", "-U", "postgres", "-d", "qr_pagamentos", "-Atc", 'SELECT id || \'|\' || username || \'|\' || COALESCE(email, \'<null>\') FROM app."user" ORDER BY id']).trim();
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
      assert(run("docker", ["exec", dbId, "psql", "-p", "5433", "-U", "postgres", "-d", "qr_pagamentos", "-Atc", 'SELECT id || \'|\' || username || \'|\' || COALESCE(email, \'<null>\') FROM app."user" ORDER BY id']).trim() === dataBeforeFailure, "migration failure changed sentinel data");
      assert(await digest(sourceKeyPath) === sourceDigest && await digest(stagedKeyPath) === stagedDigest, "migration failure changed key continuity");
      assert((await readdir(evidenceDirectory)).length === 13, "update evidence was not retained for every success and failure run");
      console.log("PASS update-install-baseline");
      console.log("PASS update-rerun");
      console.log("PASS update-volume-identity");
      console.log("PASS update-media-byte-retention");
      console.log("PASS update-nautt-key-continuity");
      console.log("PASS update-startup-gates");
      console.log("PASS update-pulled-pending-migration");
      console.log("PASS update-prisma-failure-retention");
      console.log("PASS update-bootstrap-failure-retention");
      console.log("PASS update-identity-seed-failure-retention");
      console.log("PASS update-target-health-image-rollback");
      console.log("PASS update-candidate-preflight-failure-retention");
      console.log("PASS update-target-recreate-failure-rollback");
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
NAUTT_WEBHOOK_CALLBACK_URL=https://container-test.invalid/api/nautt/webhooks
SMTP_HOST=${values.smtpHost}
SMTP_PORT=${values.smtpPort}
SMTP_USER=${values.smtpUser}
SMTP_PASSWORD=${values.smtpPassword}
SMTP_FROM=${values.smtpFrom}
SMTP_TLS_MODE=${values.smtpTlsMode}
PUBLIC_ORIGIN=${values.publicOrigin}
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
    } else if (scenario === "production-rehearsal") {
      assert(process.env.CONTAINER_TEST_CLEAN_CLONE === "1", "production rehearsal requires --clean-clone");
      const revision = run("git", ["rev-parse", "HEAD"]).trim();
      const sourceDirectory = path.resolve(".install-secrets");
      const stagedDirectory = path.resolve(".container-secrets");
      const installerEnv = path.join(temporary, "rehearsal.env");
      const smtpCaptureDir = path.join(temporary, "smtp-capture");
      const backupDestination = path.join(temporary, "backups");
      const merchantUsername = "merchant.rehearsal";
      const merchantEmail = "merchant@example.com";
      const merchantInitialPassword = `Merchant-Initial-${token}`;
      const storeSlug = `rehearsal-${token.slice(0, 8)}`;
      const appPort = 37000 + (process.pid % 1000);
      await mkdir(smtpCaptureDir, { mode: 0o700 });
      await mkdir(backupDestination, { mode: 0o700 });

      await writeFile(installerEnv, `APP_PORT=${appPort}\nINITIAL_ADMIN_USERNAME=admin.user\nINITIAL_ADMIN_EMAIL=admin@example.com\nPOSTGRES_ADMIN_PASSWORD=${values.admin}\nMIGRATOR_PASSWORD=${values.migrator}\nRUNTIME_PASSWORD=${values.runtime}\nNAUTT_ENCRYPTION_KEY=${values.nautt}\nNAUTT_WEBHOOK_CALLBACK_URL=https://container-test.invalid/api/nautt/webhooks\nSMTP_HOST=${project}-smtp-sink\nSMTP_PORT=1025\nSMTP_USER=${values.smtpUser}\nSMTP_PASSWORD=${values.smtpPassword}\nSMTP_FROM=${values.smtpFrom}\nSMTP_TLS_MODE=none\nPUBLIC_ORIGIN=${values.publicOrigin}\n`, { mode: 0o600 });
      await chmod(installerEnv, 0o600);
      const processEnv = { ...process.env, CONTAINER_TEST_PROJECT: project };

      // Clean install on a disposable project.
      const installed = execute("install/install.sh", ["--env-file", installerEnv], { env: processEnv });
      const installedOutput = `${installed.stdout ?? ""}${installed.stderr ?? ""}`;
      assert(installed.status === 0, `production-rehearsal install failed\n${installedOutput}`);
      assert(installedOutput.includes("PASS install-complete"), "install completion evidence missing");
      assertRedacted(installedOutput);

      const installedApp = await waitForApp();
      const dbId = compose(["ps", "-q", "db"]).trim();
      const sql = (statement) => run("docker", ["exec", dbId, "psql", "-p", "5433", "-U", "postgres", "-d", "qr_pagamentos", "-Atc", statement]).trim();

      assert(
        inspectField(installedApp, '{{index .Config.Labels "org.opencontainers.image.revision"}}') === revision,
        "normal install did not bind the exact revision",
      );
      env.APP_IMAGE = inspectField(installedApp, "{{.Config.Image}}");
      env.DB_OPS_IMAGE = `${project}-db-ops:${revision}`;
      env.RELEASE_REVISION = revision;
      env.APP_PORT = String(appPort);
      env.POSTGRES_ADMIN_PASSWORD_FILE = path.join(sourceDirectory, "postgres_admin_password");
      env.MIGRATOR_PASSWORD_FILE = path.join(sourceDirectory, "migrator_password");
      env.RUNTIME_PASSWORD_FILE = path.join(sourceDirectory, "runtime_password");
      env.INITIAL_ADMIN_USERNAME_FILE = path.join(stagedDirectory, "initial_admin_username");
      env.INITIAL_ADMIN_EMAIL_FILE = path.join(stagedDirectory, "initial_admin_email");
      env.INITIAL_ADMIN_PASSWORD_FILE = path.join(stagedDirectory, "initial_admin_password");
      env.STAGED_SECRETS_DIR = stagedDirectory;

      let health = await get("/api/health");
      assert(health.status === 200 && health.body === '{"status":"ok"}', "post-install health failed");

      // Mock SMTP sink on the application database network; it stores mail but never logs bodies.
      await deployMockSmtp(`${project}_database`, smtpCaptureDir);

      // Identity seed created admin.user; the installer generates the initial
      // password into .install-secrets (never operator-supplied), so read it back.
      const initialAdminPassword = (await readFile(path.join(sourceDirectory, "initial_admin_password"), "utf8")).trim();
      assert(initialAdminPassword.length > 0, "installer did not persist the initial admin password");
      const adminCookie = await loginCookie("admin.user", initialAdminPassword);

      // Administrator creates a merchant user with an email address.
      const createMerchant = await postForm("/admin/users", {
        username: merchantUsername,
        email: merchantEmail,
        password: merchantInitialPassword,
        role: "USER",
      }, { origin: values.publicOrigin, "x-forwarded-host": "container-test.invalid", cookie: adminCookie });
      assert(createMerchant.status === 303 && createMerchant.headers.location === "/admin?success=created", "merchant user creation failed");

      // Administrator triggers the SMTP-bound self-hosted reset for the merchant.
      const merchantUserId = sql(`SELECT id FROM app."user" WHERE username='${merchantUsername}'`);
      assert(/^[0-9a-f-]{36}$/.test(merchantUserId), `merchant user id missing: "${merchantUserId}"`);
      const resetResponse = await postForm(`/admin/users/${merchantUserId}/reset-password`, {}, {
        origin: values.publicOrigin,
        "x-forwarded-host": "container-test.invalid",
        cookie: adminCookie,
      });
      if (!(resetResponse.status === 303 && resetResponse.headers.location === `/admin/accounts/${merchantUserId}?reset=requested`)) {
        const userRow = sql(`SELECT email, status, role, deleted_at FROM app."user" WHERE id='${merchantUserId}'`);
        const auditRow = sql(`SELECT outcome FROM app.password_reset_request ORDER BY created_at DESC LIMIT 1`);
        const tokenTable = sql(`SELECT count(*) FROM app.password_reset_token`);
        const lookupRow = sql(`SELECT id FROM app."user" WHERE email='${merchantEmail}' AND status='ACTIVE' AND role='USER' AND deleted_at IS NULL`);
        const appId = compose(["ps", "-q", "app"]).trim();
        const probe = execute("docker", ["exec", appId, "node", "-e",
          `const fs=require("node:fs");for(const f of ["smtp_host","smtp_port","smtp_user","smtp_from","smtp_tls_mode"]){try{console.log(f,JSON.stringify(fs.readFileSync("/run/secrets/"+f,"utf8")))}catch{console.log(f,"MISSING")}};const host=fs.readFileSync("/run/secrets/smtp_host","utf8").trim();const s=require("node:net").connect(1025,host,()=>{console.log("TCP-OK");process.exit(0)});s.on("error",(e)=>{console.log("TCP-FAIL",e.code);process.exit(1)});setTimeout(()=>{console.log("TCP-TIMEOUT");process.exit(2)},3000);`]);
        const probeOutput = `${probe.stdout ?? ""}${probe.stderr ?? ""}`.replaceAll(values.smtpUser, "<smtp-user>");
        const appLogs = compose(["logs", "--no-color", "--tail", "30", "app"]);
        assertRedacted(appLogs);
        assert(false, `reset request failed status=${resetResponse.status} location=${resetResponse.headers.location} audit=[${auditRow}] user=[${userRow}] lookup=[${lookupRow}] tokenTable=[${tokenTable}] mailProbe status=${probe.status}\n${probeOutput}\nAPPLOGS\n${appLogs}`);
      }

      // Capture the reset message, extract the token, and redeem it without leaking either.
      const emailText = await readSmtpCapture(smtpCaptureDir);
      const resetToken = extractResetToken(emailText);
      const newMerchantPassword = `Merchant-Rotated-${token.slice(0, 8)}`;
      const redeem = await postForm("/reset-password/submit", {
        token: resetToken,
        newPassword: newMerchantPassword,
        confirmation: newMerchantPassword,
      }, { origin: values.publicOrigin, "x-forwarded-host": "container-test.invalid" });
      if (!(redeem.status === 303 && redeem.headers.location === "/login?password=changed")) {
        const extractedDigest = createHash("sha256").update(resetToken).digest("hex");
        const storedDigests = sql(`SELECT token_digest, consumed_at, expires_at > now() FROM app.password_reset_token WHERE user_id='${merchantUserId}'`);
        assert(false, `reset redemption failed status=${redeem.status} location=${redeem.headers.location} tokenLength=${resetToken.length} extractedDigestPrefix=${extractedDigest.slice(0, 12)} stored=[${storedDigests.slice(0, 80)}]`);
      }

      // Assert the password rotated by authenticating with the new password.
      const merchantCookie = await loginCookie(merchantUsername, newMerchantPassword);
      assert(merchantCookie, "merchant login with rotated password failed");
      assert(!installedOutput.includes(resetToken), "reset token leaked in install output");
      assert(!emailText.includes(newMerchantPassword), "new password leaked in captured email");
      assertRedacted(installedOutput + emailText);

      // Active currency mappings for representative Commerce V2 journeys.
      const brlPairId = randomUUID();
      const brlCurrencyUuid = randomUUID();
      const brlExchangeUuid = randomUUID();
      const usdPairId = randomUUID();
      const usdCurrencyUuid = randomUUID();
      const usdExchangeUuid = randomUUID();
      sql(`INSERT INTO app.catalog_currency_pair (id, label, currency_uuid, exchange_currency_uuid, active, created_at, updated_at) VALUES ('${brlPairId}', 'Real brasileiro', '${brlCurrencyUuid}', '${brlExchangeUuid}', true, now(), now())`);
      sql(`INSERT INTO app.supported_exchange_currency (code, pair_id) VALUES ('BRL', '${brlPairId}')`);
      sql(`INSERT INTO app.catalog_currency_pair (id, label, currency_uuid, exchange_currency_uuid, active, created_at, updated_at) VALUES ('${usdPairId}', 'US Dollar', '${usdCurrencyUuid}', '${usdExchangeUuid}', true, now(), now())`);
      sql(`INSERT INTO app.supported_exchange_currency (code, pair_id) VALUES ('USD', '${usdPairId}')`);

      // Media persistence through the application: upload a storefront logo as the merchant owner.
      const fixtureLogoPath = path.join(temporary, "fixture-logo.webp");
      await createFixtureImage(installedApp, fixtureLogoPath);
      const logoUpload = await postMultipart("/storefront/logo", [
        { name: "logo", filename: "logo.webp", contentType: "image/webp", value: await readFile(fixtureLogoPath) },
      ], merchantCookie, { origin: values.publicOrigin, "x-forwarded-host": "container-test.invalid" });
      assert(logoUpload.status === 303 && logoUpload.headers.location?.includes("storefront-logo=staged&logo="), "logo upload failed");
      const logoIdentifier = new URLSearchParams(new URL(logoUpload.headers.location, values.publicOrigin).search).get("logo");
      assert(logoIdentifier && logoIdentifier.length === 43, "logo identifier missing or invalid");

      // Save storefront settings (slug, logo, default currency, enabled) through the application.
      const storefrontSave = await postForm("/storefront", {
        storefrontSlug: storeSlug,
        storefrontDisplayNamePtBr: "Vitrine de Ensaio",
        storefrontDisplayNameEn: "Rehearsal Storefront",
        storefrontAccentColor: "#FF0000",
        storefrontEnabled: "true",
        storefrontThemeId: "",
        storefrontLayout: "boxed",
        storefrontLogoMediaIdentifier: logoIdentifier,
        storefrontStandalonePaymentsEnabled: "true",
        storefrontDefaultCurrencyCode: "BRL",
      }, { origin: values.publicOrigin, "x-forwarded-host": "container-test.invalid", cookie: merchantCookie });
      assert(storefrontSave.status === 303 && storefrontSave.headers.location === "/?storefront=changed", "storefront settings save failed");

      // Seed a product with a directly-created product image media object and file.
      const productImageIdentifier = "B".repeat(43);
      const productImageStorageKey = "C".repeat(43);
      const productImageBytes = Buffer.from("rehearsal-product-image");
      const productImageDigest = createHash("sha256").update(productImageBytes).digest("hex");
      run("docker", [
        "run", "--rm", "--network", "none", "--read-only", "--tmpfs", "/tmp",
        "--user", "1000:1000", "--volume", `${project}_media-data:/app/media`,
        "--entrypoint", "node", env.APP_IMAGE, "-e",
        `require("node:fs").writeFileSync("/app/media/objects/${productImageStorageKey}.webp",Buffer.from("${productImageBytes.toString("base64")}","base64"),{mode:0o600,flag:"wx"})`,
      ]);
      sql(`INSERT INTO app.media_object (id,identifier,storage_key,owner_id,purpose,state,lifecycle_revision,mime_type,byte_size,width,height,sha256,purge_after,created_at,updated_at) SELECT gen_random_uuid(),'${productImageIdentifier}','${productImageStorageKey}','${merchantUserId}','PRODUCT_IMAGE','ACTIVE',0,'image/webp',${productImageBytes.length},1,1,'${productImageDigest}',NULL,now(),now()`);
      sql(`INSERT INTO app.product (id,owner_id,internal_name,title_pt_br,title_en,description_pt_br,description_en,price,active,currency_code,image_media_id,category_id,archived_at,version,created_at,updated_at) VALUES (gen_random_uuid(),'${merchantUserId}','Rehearsal Product','Produto de Ensaio','Rehearsal Product','Descrição','Description','100',true,'BRL','${productImageIdentifier}',NULL,NULL,0,now(),now())`);

      // Representative Commerce V2 payment link (FIXED_AMOUNT) seeded directly.
      const paymentLinkIdentifier = randomBytes(18).toString("base64url");
      sql(`INSERT INTO app.payment_link_v2 (id,identifier,owner_id,composition_kind,description_pt_br,description_en,amount,currency_pair_id,link_type,active,created_at,updated_at,version) VALUES (gen_random_uuid(),'${paymentLinkIdentifier}','${merchantUserId}','FIXED_AMOUNT','Pagamento fixo','Fixed payment','50','${brlPairId}','MULTI_USE',true,now(),now(),0)`);

      // Representative V2 order row (AD_HOC, stateless) seeded directly.
      const orderId = randomUUID();
      sql(`INSERT INTO app.order_v2 (id,owner_id,source,payment_link_v2_id,state,lifecycle_version,amount,currency_uuid,exchange_currency_uuid,description_pt_br,description_en,checkout_data_policy,created_at,updated_at) VALUES ('${orderId}','${merchantUserId}','AD_HOC',NULL,NULL,0,'75','${brlCurrencyUuid}','${brlExchangeUuid}','Pedido de ensaio','Rehearsal order','NONE',now(),now())`);

      // Storefront cart checkout through the application issues a SINGLE_USE PRODUCT_LINES link.
      const productReference = sql(`SELECT id FROM app.product WHERE owner_id='${merchantUserId}' ORDER BY created_at DESC LIMIT 1`);
      const cartCheckout = await postJson(`/api/store/${storeSlug}/cart/checkout`, {
        items: [{ reference: productReference, quantity: 2 }],
      }, undefined, { "x-forwarded-for": "203.0.113.1" });
      assert(cartCheckout.status === 201, `cart checkout failed status=${cartCheckout.status} body=${cartCheckout.body}`);
      const checkoutResponse = JSON.parse(cartCheckout.body);
      assert(checkoutResponse.paymentLinkIdentifier && checkoutResponse.paymentLinkIdentifier.length === 24, "cart checkout did not issue a payment link identifier");

      // Verify representative rows exist.
      assert(sql(`SELECT count(*) FROM app.payment_link_v2 WHERE owner_id='${merchantUserId}'`) === "2", "expected two V2 payment links");
      assert(sql(`SELECT count(*) FROM app.order_v2 WHERE owner_id='${merchantUserId}'`) === "1", "expected one V2 order");

      // Pre-backup inventory snapshot for later comparison.
      const mediaBeforeBackup = sql(`SELECT identifier FROM app.media_object WHERE owner_id='${merchantUserId}' ORDER BY identifier`);
      const productBeforeBackup = sql(`SELECT id FROM app.product WHERE owner_id='${merchantUserId}' ORDER BY id`);
      const orderBeforeBackup = sql(`SELECT id FROM app.order_v2 WHERE owner_id='${merchantUserId}' ORDER BY id`);

      // 11.2.2 integration: bilingual display names and six-theme resolution on the
      // public /store/[slug] page. The page resolves locale only from the session
      // principal's persisted preference; sessionless requests render pt-BR.
      const storefrontPagePtBr = await get(`/store/${storeSlug}`);
      assert(storefrontPagePtBr.status === 200, "public storefront page did not render");
      assert(storefrontPagePtBr.body.includes("Vitrine de Ensaio"), "pt-BR storefront display name missing");
      assert(storefrontPagePtBr.body.includes('data-theme-preview="pix-paper"'), "default theme was not scoped on the storefront page");

      const merchantLocaleEn = await postForm("/language-preference", { locale: "en" }, {
        origin: values.publicOrigin,
        "x-forwarded-host": "container-test.invalid",
        cookie: merchantCookie,
      });
      assert(merchantLocaleEn.status === 303 && merchantLocaleEn.headers.location === "/?language=saved", "merchant locale switch failed");
      const storefrontPageEn = await get(`/store/${storeSlug}`, { cookie: merchantCookie });
      assert(storefrontPageEn.status === 200 && storefrontPageEn.body.includes("Rehearsal Storefront"), "en storefront display name missing");

      const themeChange = await postForm("/storefront", {
        storefrontSlug: storeSlug,
        storefrontDisplayNamePtBr: "Vitrine de Ensaio",
        storefrontDisplayNameEn: "Rehearsal Storefront",
        storefrontAccentColor: "#FF0000",
        storefrontEnabled: "true",
        storefrontThemeId: "vault-blue",
      }, { origin: values.publicOrigin, "x-forwarded-host": "container-test.invalid", cookie: merchantCookie });
      assert(themeChange.status === 303 && themeChange.headers.location === "/?storefront=changed", "storefront theme change failed");
      const storefrontPageThemed = await get(`/store/${storeSlug}`);
      assert(storefrontPageThemed.status === 200 && storefrontPageThemed.body.includes('data-theme-preview="vault-blue"'), "updated theme was not scoped on the storefront page");
      console.log("PASS production-rehearsal-locale-theme-rendering");

      // Update: no-op fast-forward against the same revision.
      const update = execute("install/update.sh", ["--env-file", installerEnv], { env: processEnv });
      const updateOutput = `${update.stdout ?? ""}${update.stderr ?? ""}`;
      assert(update.status === 0, `update failed\n${updateOutput}`);
      assert(updateOutput.includes("PASS update-complete"), "update completion evidence missing");
      assert(updateOutput.includes(`revision=${revision}`), "update evidence did not bind the exact revision");
      assertRedacted(updateOutput);

      await waitForApp();
      health = await get("/api/health");
      assert(health.status === 200 && health.body === '{"status":"ok"}', "post-update health failed");

      // Backup to a disposable destination.
      const backup = execute("install/backup.sh", ["--env-file", installerEnv, "--destination", backupDestination], { env: processEnv });
      const backupOutput = `${backup.stdout ?? ""}${backup.stderr ?? ""}`;
      assert(backup.status === 0, `backup failed\n${backupOutput}`);
      const backupSet = backupOutput.match(/PASS media-backup set=(.+)/)?.[1]?.trim();
      assert(backupSet, "backup set evidence missing");
      const manifest = JSON.parse(await readFile(path.join(backupSet, "manifest.json"), "utf8"));
      assert(manifest.application_revision === revision, "backup manifest revision mismatch");
      assert(manifest.application_image === `${project}-app:${revision}`, "backup manifest app image mismatch");
      assert(manifest.database_operations_image === `${project}-db-ops:${revision}`, "backup manifest db-ops image mismatch");
      assert(manifest.compose_project === project, "backup manifest project mismatch");
      for (const secret of Object.values(values)) {
        assert(!JSON.stringify(manifest).includes(secret), "backup manifest leaked a protected value");
      }
      assertRedacted(backupOutput);

      // Restore with correct confirmation and verify post-restate health/inventory.
      const restored = execute("install/restore.sh", ["--env-file", installerEnv, "--backup", backupSet, "--confirm", `RESTORE:${project}`], { env: processEnv });
      const restoredOutput = `${restored.stdout ?? ""}${restored.stderr ?? ""}`;
      assert(restored.status === 0, `restore failed\n${restoredOutput}`);
      assert(restoredOutput.includes("PASS media-restore"), "restore evidence missing");
      assertRedacted(restoredOutput);

      await waitForApp();
      health = await get("/api/health");
      assert(health.status === 200 && health.body === '{"status":"ok"}', "post-restore health failed");

      const dbIdAfterRestore = compose(["ps", "-q", "db"]).trim();
      const sqlAfterRestore = (statement) => run("docker", ["exec", dbIdAfterRestore, "psql", "-p", "5433", "-U", "postgres", "-d", "qr_pagamentos", "-Atc", statement]).trim();
      assert(sqlAfterRestore(`SELECT identifier FROM app.media_object WHERE owner_id='${merchantUserId}' ORDER BY identifier`) === mediaBeforeBackup, "post-restore media inventory changed");
      assert(sqlAfterRestore(`SELECT id FROM app.product WHERE owner_id='${merchantUserId}' ORDER BY id`) === productBeforeBackup, "post-restore product inventory changed");
      assert(sqlAfterRestore(`SELECT id FROM app.order_v2 WHERE owner_id='${merchantUserId}' ORDER BY id`) === orderBeforeBackup, "post-restore order inventory changed");

      const logoReadAfterRestore = await get(`/media/${logoIdentifier}`);
      assert(logoReadAfterRestore.status === 200, "post-restore logo media read failed");

      const appIdAfterRestore = compose(["ps", "-q", "app"]).trim();
      assert(inspectField(appIdAfterRestore, '{{index .Config.Labels "org.opencontainers.image.revision"}}') === revision, "post-restore app image revision mismatch");
      assert(/^[0-9a-f]{40}$/.test(manifest.application_revision), "backup manifest revision is not a 40-character SHA");

      console.log("PASS production-rehearsal-install");
      console.log("PASS production-rehearsal-identity-seed");
      console.log("PASS production-rehearsal-health-after-install");
      console.log("PASS production-rehearsal-smtp-sink");
      console.log("PASS production-rehearsal-admin-password-reset");
      console.log("PASS production-rehearsal-commerce-fixtures");
      console.log("PASS production-rehearsal-media-persistence");
      console.log("PASS production-rehearsal-update-noop");
      console.log("PASS production-rehearsal-backup-manifest");
      console.log("PASS production-rehearsal-restore");
      console.log("PASS production-rehearsal-post-restore-health");
      console.log("PASS production-rehearsal-exact-revision-ledger");
    }
  } catch (error) {
    scenarioFailed = true;
    throw error;
  } finally {
    execute("docker", ["rm", "-f", "-v", `${project}-smtp-sink`]);
    const cleanup = composeResult(["down", "--volumes", "--remove-orphans", "--rmi", "local"]);
    await rm(temporary, { recursive: true, force: true });
    if (!scenarioFailed) assert(cleanup.status === 0, "container cleanup failed");
  }
}
