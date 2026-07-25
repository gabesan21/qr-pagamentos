import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const artifactRoot = path.join(root, "artifacts", "orders");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const parse = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const current = await parse(path.join(artifactRoot, "current.json"));
assert(/^\d{14}$/.test(current.runId), "Orders evidence current run ID is not 14 UTC digits.");
assert(current.manifest === `artifacts/orders/${current.runId}/manifest.json`, "Orders evidence manifest pointer is not canonical.");
assert(current.review === `artifacts/orders/${current.runId}/review.md`, "Orders evidence review pointer is not canonical.");
const runDirectory = path.join(artifactRoot, current.runId);
const manifest = await parse(path.join(root, current.manifest));
assert(manifest.runId === current.runId, "Orders evidence pointer, directory, and manifest disagree.");
assert(manifest.baseCaptureCount === 36 && manifest.stateCaptureCount === 12 && manifest.totalPngCount === 48, "Orders evidence capture counts are not closed.");
assert(Array.isArray(manifest.captures) && manifest.captures.length === 48, "Orders evidence manifest does not bind 48 captures.");
assert(manifest.externalRequests.length === 0 && manifest.consoleErrors.length === 0 && manifest.pageErrors.length === 0, "Orders evidence records runtime or external-request failures.");

const expected = new Set();
for (const locale of ["pt-BR", "en"]) {
  for (const theme of ["pix-paper", "cashier-daylight", "settlement-sand", "midnight-clearing", "vault-blue", "terminal-amber"]) {
    for (const width of [375, 768, 1440]) expected.add(`directory-${theme}-${locale}-${width}.png`);
  }
}
for (const name of [
  "state-pt-BR-orders-empty-375",
  "state-pt-BR-orders-ready-320",
  "state-pt-BR-order-detail-comments-1440",
  "state-pt-BR-order-detail-unavailable-1440",
  "state-pt-BR-order-commented-notice-1440",
  "state-en-orders-filtered-empty-1440",
  "state-en-orders-invalid-query-1440",
  "state-en-orders-page-2-1440",
  "state-en-order-comment-edited-notice-1440",
  "state-en-order-outcome-set-notice-1440",
  "state-en-order-failed-notice-1440",
  "state-en-orders-page-size-preference-1440",
]) expected.add(`${name}.png`);
assert(expected.size === 48, `Orders evidence expected capture inventory is invalid: ${expected.size}`);
for (const capture of manifest.captures) {
  const fileName = path.basename(capture.path);
  assert(expected.delete(fileName), `Orders evidence contains an unexpected or duplicate capture: ${fileName}`);
  const [bytes, metadata] = await Promise.all([readFile(path.join(root, capture.path)), stat(path.join(root, capture.path))]);
  assert(metadata.size > 0 && metadata.size === capture.bytes && sha256(bytes) === capture.sha256, `Orders capture hash mismatch: ${fileName}`);
}
assert(expected.size === 0, `Orders evidence is missing captures: ${[...expected].join(", ")}`);

const runFiles = await readdir(runDirectory);
assert(runFiles.length === 51, `Orders evidence run must contain exactly 51 files, found ${runFiles.length}.`);
assert(runFiles.filter((file) => file.endsWith(".png")).length === 48, "Orders evidence run does not contain exactly 48 PNGs.");
assert(["assertions.json", "manifest.json", "review.md"].every((file) => runFiles.includes(file)), "Orders evidence metadata inventory is incomplete.");

const assertionsBytes = await readFile(path.join(root, manifest.assertions));
assert(sha256(assertionsBytes) === manifest.assertionsSha256, "Orders evidence assertions hash mismatch.");
const assertions = JSON.parse(assertionsBytes);
const grid = assertions.filter((entry) => typeof entry.state === "string" && /^directory-.+(?:375|768|1440)$/.test(entry.state));
assert(grid.length === 36, "Orders evidence objective grid assertions are incomplete.");
const inspected = assertions.filter((entry) => entry.measured && entry.focus);
assert(inspected.length === 48, "Orders evidence does not inspect all 48 captures.");
assert(inspected.every((entry) => entry.severeAxe.length === 0
  && !entry.measured.overflow
  && entry.measured.targets.every((target) => target.height >= 44 && target.width >= 44)
  && (entry.focus.outlineWidth >= 2 || entry.focus.boxShadow !== "none")), "Orders evidence accessibility, target, overflow, or focus assertion failed.");

const facts = assertions.find((entry) => entry.state === "directory-facts");
assert(facts?.payer === "Ana Evidence" && facts?.badges?.length === 5 && /^[A-Za-z0-9_-]{24}$/.test(facts.linkIdentifier ?? ""), "Orders evidence does not prove the payer, badge, and link facts.");
const pagination = assertions.find((entry) => entry.state === "pagination");
assert(pagination?.firstPage === 20 && pagination.secondPage === 5 && pagination.distinct === true, "Orders evidence does not prove the bounded keyset pagination.");
const unavailable = assertions.find((entry) => entry.state === "detail-unavailable");
assert(unavailable?.opaque === true, "Orders evidence does not prove the opaque unavailable detail outcome.");
const invalid = assertions.find((entry) => entry.state === "invalid-query-no-echo");
assert(invalid?.echoed === false, "Orders evidence does not prove the invalid-query state echoes no input.");
const detail = assertions.find((entry) => entry.state === "detail-comments");
assert(detail?.comments === 2 && detail.edited === true, "Orders evidence does not prove the comment-thread detail.");
const outcomes = Object.fromEntries(assertions.filter((entry) => typeof entry.outcome === "string").map((entry) => [entry.state, entry.outcome]));
assert(outcomes["append-comment"] === "commented", "Orders evidence does not prove the comment append flow.");
assert(outcomes["edit-comment"] === "comment-edited", "Orders evidence does not prove the author comment edit CAS flow.");
assert(outcomes["set-outcome"] === "outcome-set", "Orders evidence does not prove the guarded local-outcome flow.");
assert(outcomes["set-outcome-stale-cas"] === "failed", "Orders evidence does not prove the opaque stale lifecycle CAS failure.");
const preference = assertions.find((entry) => entry.state === "page-size-preference");
assert(preference?.applied === 50 && preference.persisted === 10, "Orders evidence does not prove the page-size preference.");

for (const [sourcePath, expectedHash] of Object.entries(manifest.sourceHashes)) {
  assert(sha256(await readFile(path.join(root, sourcePath))) === expectedHash, `Orders evidence source inventory is stale: ${sourcePath}`);
}
const manifestBytes = await readFile(path.join(root, current.manifest));
const review = await readFile(path.join(root, current.review), "utf8");
assert(review.includes(current.runId) && review.includes(sha256(manifestBytes)), "Orders visual review is not bound to the current manifest.");
assert(!/unresolved severity\s*[2-4]|severity\s*[2-4]\s*:\s*(?!none)/i.test(review), "Orders visual review contains an unresolved severity 2+ finding.");
console.log(`Verified merchant orders management evidence ${current.runId}`);
