import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const helper = "node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d";
const names = {
  POSTGRES_ADMIN_PASSWORD_FILE: "admin_password",
  MIGRATOR_PASSWORD_FILE: "migrator_password",
  RUNTIME_PASSWORD_FILE: "runtime_password",
};

function fail(message) { throw new Error(message); }
function run(args) {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.status !== 0) fail(`secret staging helper failed (${result.status})`);
}

async function loadEnvFile(file) {
  if (!file) return;
  const text = await readFile(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) fail(`invalid env-file line in ${file}`);
    const key = line.slice(0, index);
    if (!(key in process.env)) process.env[key] = line.slice(index + 1);
  }
}

const envFileIndex = process.argv.indexOf("--env-file");
await loadEnvFile(envFileIndex >= 0 ? process.argv[envFileIndex + 1] : undefined);
const output = path.resolve(process.env.STAGED_SECRETS_DIR ?? ".container-secrets");
if (process.argv.includes("--clean")) {
  await rm(output, { recursive: true, force: true });
  console.log("PASS staged-secret-cleanup");
  process.exit(0);
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true, mode: 0o700 });

for (const [variable, target] of Object.entries(names)) {
  const source = process.env[variable];
  if (!source || !path.isAbsolute(source)) fail(`${variable} must be an absolute path`);
  const info = await stat(source);
  if (!info.isFile() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o600) {
    fail(`${variable} must be an invoking-user-owned mode-0600 regular file`);
  }
  run(["run", "--rm", "--network", "none", "--read-only", "--tmpfs", "/tmp", "-v", `${source}:/source:ro`, "-v", `${output}:/staged`, helper,
    "sh", "-eu", "-c", `umask 077; cp /source /staged/${target}; chown 1000:1000 /staged/${target}; chmod 0400 /staged/${target}`]);
  const staged = await stat(path.join(output, target));
  if (staged.uid !== 1000 || staged.gid !== 1000 || (staged.mode & 0o777) !== 0o400) fail(`invalid staged identity for ${target}`);
}
console.log("PASS source-secret-permissions");
console.log("PASS staged-secret-permissions");
