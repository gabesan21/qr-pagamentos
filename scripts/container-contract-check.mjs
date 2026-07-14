import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

function assert(condition, message) { if (!condition) throw new Error(message); }
function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

const dockerfile = await readFile("Dockerfile", "utf8");
const compose = await readFile("compose.yaml", "utf8");
const nextConfig = await readFile("next.config.ts", "utf8");
const pairs = [
  { tag: "node:24.18.0-bookworm-slim", source: dockerfile },
  { tag: "postgres:18.4-bookworm", source: compose },
];
const architecture = process.arch === "x64" ? "amd64" : process.arch === "arm64" ? "arm64" : process.arch;
for (const { tag, source } of pairs) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const committed = source.match(new RegExp(`${escaped}@(sha256:[a-f0-9]{64})`))?.[1];
  assert(committed, `missing committed digest for ${tag}`);
  const display = run("docker", ["buildx", "imagetools", "inspect", tag]);
  const live = display.match(/^Digest:\s+(sha256:[a-f0-9]{64})$/m)?.[1];
  assert(live === committed, `${tag} live index ${live} differs from committed ${committed}`);
  const index = JSON.parse(run("docker", ["buildx", "imagetools", "inspect", "--raw", tag]));
  const child = index.manifests?.find((manifest) => manifest.platform?.os === "linux" && manifest.platform?.architecture === architecture && !manifest.platform?.variant);
  assert(child?.digest, `${tag} has no linux/${architecture} platform manifest`);
  console.log(`PASS tag-digest-equality tag=${tag} index=${committed} platform=linux/${architecture} child=${child.digest}`);
}

assert(nextConfig.includes('output: "standalone"'), "Next standalone output is disabled");
for (const expected of [
  "USER 1000:1000", 'ENTRYPOINT ["node", "container/runtime.mjs"]',
  "HEALTHCHECK", "/workspace/.next/standalone", "/workspace/.next/static", "/workspace/public",
]) assert(dockerfile.includes(expected), `Dockerfile lost ${expected}`);
assert(!/ARG\s+.*(?:PASSWORD|SECRET|DATABASE_URL)|ENV\s+.*(?:PASSWORD|SECRET)/i.test(dockerfile), "secret-bearing Docker ARG/ENV is forbidden");
for (const expected of ["service_healthy", "service_completed_successfully", "/var/lib/postgresql", "127.0.0.1:${APP_PORT:-3000}:3000", "read_only: true", 'user: "1000:1000"']) {
  assert(compose.includes(expected), `Compose lost ${expected}`);
}
assert(!/5432:5432|ports:\s*\n\s*-.*5432/m.test(compose), "database port must not be published");
assert(!compose.includes("MIGRATION_DATABASE_URL:") && !compose.includes("DATABASE_URL:"), "Compose must not render credential URLs");
const bootstrap = await readFile("container/bootstrap.mjs", "utf8");
assert(bootstrap.includes('readFile("prisma/bootstrap.sql"') && !bootstrap.includes("CREATE ROLE"), "wrapper must execute, not duplicate, bootstrap SQL");
const runtime = await readFile("container/runtime.mjs", "utf8");
assert(runtime.includes('query("SELECT 1 AS ready")') && runtime.includes('["server.js"]'), "runtime preflight contract changed");
console.log("PASS image-contract");

const docsIndex = process.argv.indexOf("--docs");
if (docsIndex >= 0) {
  const range = process.argv[docsIndex + 1];
  assert(range && /^[0-9a-f]{7,40}\.\.[0-9a-f]{7,40}$/.test(range), "--docs requires a committed Git range");
  const changed = run("git", ["diff", "--name-only", range]).split(/\r?\n/);
  for (const path of ["Dockerfile", "compose.yaml", "container/runtime.mjs", "README.md", "AGENTS.md"]) assert(changed.includes(path), `${path} missing from committed task range`);
  const readme = await readFile("README.md", "utf8");
  for (const text of ["Production container startup", "container:prepare-secrets", "docker compose --env-file .env.compose ps", "docker compose --env-file .env.compose logs", "docker compose --env-file .env.compose stop", "Rollback without deleting data", "Test-only destructive cleanup", "Critical verification in 005", "/api/health", "127.0.0.1"]) assert(readme.includes(text), `README missing ${text}`);
  console.log("PASS container-documentation");
  const rootDox = await readFile("AGENTS.md", "utf8");
  const prismaDox = await readFile("prisma/AGENTS.md", "utf8");
  assert(rootDox.includes("compose.yaml") && rootDox.includes("container:contract-check"), "root DOX lacks container routing");
  assert(prismaDox.includes("container/bootstrap.mjs") && prismaDox.includes("prisma/bootstrap.sql"), "Prisma DOX lacks immutable bootstrap ownership");
  console.log("PASS dox-contract");
}
