import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const artifactRoot = path.join(root, "artifacts", "admin-settings");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const parse = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const current = await parse(path.join(artifactRoot, "current.json"));
assert(/^\d{14}$/.test(current.runId), "Admin settings evidence current run ID is not 14 UTC digits.");
assert(current.manifest === `artifacts/admin-settings/${current.runId}/manifest.json`, "Admin settings evidence manifest pointer is not canonical.");
assert(current.review === `artifacts/admin-settings/${current.runId}/review.md`, "Admin settings evidence review pointer is not canonical.");
const runDirectory = path.join(artifactRoot, current.runId);
const manifest = await parse(path.join(root, current.manifest));
assert(manifest.runId === current.runId, "Admin settings evidence pointer, directory, and manifest disagree.");
assert(manifest.baseCaptureCount === 36 && manifest.stateCaptureCount === 4 && manifest.totalPngCount === 40, "Admin settings evidence capture counts are not closed.");
assert(Array.isArray(manifest.captures) && manifest.captures.length === 40, "Admin settings evidence manifest does not bind 40 captures.");
assert(manifest.externalRequests.length === 0 && manifest.consoleErrors.length === 0 && manifest.pageErrors.length === 0, "Admin settings evidence records runtime or external-request failures.");

const expected = new Set();
for (const locale of ["pt-BR", "en"]) {
  for (const theme of ["pix-paper", "cashier-daylight", "settlement-sand", "midnight-clearing", "vault-blue", "terminal-amber"]) {
    for (const width of [375, 768, 1440]) expected.add(`hub-${theme}-${locale}-${width}.png`);
  }
}
for (const name of [
  "state-pt-BR-hub-empty-375",
  "state-pt-BR-theme-default-saved-1440",
  "state-pt-BR-hub-ready-320",
  "state-en-exchange-currency-registered-1440",
]) expected.add(`${name}.png`);
assert(expected.size === 40, `Admin settings evidence expected capture inventory is invalid: ${expected.size}`);
for (const capture of manifest.captures) {
  const fileName = path.basename(capture.path);
  assert(expected.delete(fileName), `Admin settings evidence contains an unexpected or duplicate capture: ${fileName}`);
  const [bytes, metadata] = await Promise.all([readFile(path.join(root, capture.path)), stat(path.join(root, capture.path))]);
  assert(metadata.size > 0 && metadata.size === capture.bytes && sha256(bytes) === capture.sha256, `Admin settings capture hash mismatch: ${fileName}`);
}
assert(expected.size === 0, `Admin settings evidence is missing captures: ${[...expected].join(", ")}`);

const runFiles = await readdir(runDirectory);
assert(runFiles.length === 43, `Admin settings evidence run must contain exactly 43 files, found ${runFiles.length}.`);
assert(runFiles.filter((file) => file.endsWith(".png")).length === 40, "Admin settings evidence run does not contain exactly 40 PNGs.");
assert(["assertions.json", "manifest.json", "review.md"].every((file) => runFiles.includes(file)), "Admin settings evidence metadata inventory is incomplete.");

const assertionsBytes = await readFile(path.join(root, manifest.assertions));
assert(sha256(assertionsBytes) === manifest.assertionsSha256, "Admin settings evidence assertions hash mismatch.");
const assertions = JSON.parse(assertionsBytes);
const grid = assertions.filter((entry) => typeof entry.state === "string" && /^hub-.+(?:375|768|1440)$/.test(entry.state));
assert(grid.length === 36, "Admin settings evidence objective grid assertions are incomplete.");
const inspected = assertions.filter((entry) => entry.measured && entry.focus);
assert(inspected.length === 40, "Admin settings evidence does not inspect all 40 captures.");
assert(inspected.every((entry) => entry.severeAxe.length === 0
  && !entry.measured.overflow
  && entry.measured.targets.every((target) => target.height >= 44 && target.width >= 44)
  && (entry.focus.outlineWidth >= 2 || entry.focus.boxShadow !== "none")), "Admin settings evidence accessibility, target, overflow, or focus assertion failed.");

const structure = assertions.find((entry) => entry.state === "hub-structure");
assert(structure?.sections === 6 && structure?.anchors === 6 && structure?.emptyStates === 3 && structure?.fallbackTheme === "pix-paper", "Admin settings evidence does not prove the six anchored sections, empty states, and fallback theme.");
const save = assertions.find((entry) => entry.state === "theme-default-save");
assert(save?.outcome === "saved" && save?.persisted === "vault-blue", "Admin settings evidence does not prove the persisted theme-default save.");
const stamping = assertions.find((entry) => entry.state === "creation-stamping");
assert(stamping?.merchantTheme === "vault-blue" && stamping?.adminTheme === null, "Admin settings evidence does not prove creation-time USER-only stamping.");
const registration = assertions.find((entry) => entry.state === "exchange-currency-register");
assert(registration?.outcome === "registered" && registration?.code === "USD", "Admin settings evidence does not prove the exchange-currency registration.");

for (const [sourcePath, expectedHash] of Object.entries(manifest.sourceHashes)) {
  assert(sha256(await readFile(path.join(root, sourcePath))) === expectedHash, `Admin settings evidence source inventory is stale: ${sourcePath}`);
}
const manifestBytes = await readFile(path.join(root, current.manifest));
const review = await readFile(path.join(root, current.review), "utf8");
assert(review.includes(current.runId) && review.includes(sha256(manifestBytes)), "Admin settings visual review is not bound to the current manifest.");
assert(!/unresolved severity\s*[2-4]|severity\s*[2-4]\s*:\s*(?!none)/i.test(review), "Admin settings visual review contains an unresolved severity 2+ finding.");
console.log(`Verified administrator settings hub evidence ${current.runId}`);
