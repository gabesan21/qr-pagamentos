import { spawnSync } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function execute(command, args, options = {}) {
  return spawnSync(command, args, { cwd: process.cwd(), encoding: "utf8", stdio: "inherit", ...options });
}

const startedAt = new Date().toISOString();
const runId = startedAt.replaceAll(/[^\d]/g, "").slice(0, 14);
const artifactRoot = join(process.cwd(), "artifacts", "brand-assets");
const runDirectory = join(artifactRoot, runId);
await mkdir(artifactRoot, { recursive: true });
let collision = false;
try { await access(runDirectory); collision = true; } catch {}
assert(!collision, `Fresh brand-assets run directory already exists: ${runId}`);

const environment = {
  ...process.env,
  ADMIN_EVIDENCE_BASE_URL: "http://127.0.0.1:1",
  BRAND_ASSET_EVIDENCE_RUN_ID: runId,
  BRAND_ASSET_EVIDENCE_STARTED_AT: startedAt,
};
const browser = execute(join(process.cwd(), "node_modules", ".bin", "playwright"),
  ["test", "tests/brand-assets.evidence.spec.ts", "--project=chromium"], { env: environment });
assert(browser.status === 0, `Brand-assets Chromium evidence failed with status ${browser.status}.`);
const verified = execute(process.execPath, ["scripts/verify-brand-assets-evidence.mjs"], { env: environment });
assert(verified.status === 0, `Brand-assets evidence verification failed with status ${verified.status}.`);
console.log(`BRAND_ASSET_EVIDENCE_RUN=${runId}`);
