import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const artifactRoot = path.join(root, "artifacts", "links");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const parse = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const current = await parse(path.join(artifactRoot, "current.json"));
assert(/^\d{14}$/.test(current.runId), "Links evidence current run ID is not 14 UTC digits.");
assert(current.manifest === `artifacts/links/${current.runId}/manifest.json`, "Links evidence manifest pointer is not canonical.");
assert(current.review === `artifacts/links/${current.runId}/review.md`, "Links evidence review pointer is not canonical.");
const runDirectory = path.join(artifactRoot, current.runId);
const manifest = await parse(path.join(root, current.manifest));
assert(manifest.runId === current.runId, "Links evidence pointer, directory, and manifest disagree.");
assert(manifest.baseCaptureCount === 36 && manifest.stateCaptureCount === 17 && manifest.totalPngCount === 53, "Links evidence capture counts are not closed.");
assert(Array.isArray(manifest.captures) && manifest.captures.length === 53, "Links evidence manifest does not bind 53 captures.");
assert(manifest.externalRequests.length === 0 && manifest.consoleErrors.length === 0 && manifest.pageErrors.length === 0, "Links evidence records runtime or external-request failures.");

const expected = new Set();
for (const locale of ["pt-BR", "en"]) {
  for (const theme of ["pix-paper", "cashier-daylight", "settlement-sand", "midnight-clearing", "vault-blue", "terminal-amber"]) {
    for (const width of [375, 768, 1440]) expected.add(`directory-${theme}-${locale}-${width}.png`);
  }
}
for (const name of [
  "state-pt-BR-links-empty-375",
  "state-pt-BR-links-ready-320",
  "state-pt-BR-link-detail-1440",
  "state-pt-BR-link-detail-unavailable-1440",
  "state-pt-BR-link-new-1440",
  "state-pt-BR-link-new-375",
  "state-pt-BR-link-edit-1440",
  "state-pt-BR-link-created-notice-1440",
  "state-en-links-filtered-empty-1440",
  "state-en-links-invalid-query-1440",
  "state-en-links-page-2-1440",
  "state-en-link-detail-fixed-1440",
  "state-en-link-created-notice-1440",
  "state-en-link-fixed-created-1440",
  "state-en-link-edited-notice-1440",
  "state-en-link-failed-notice-1440",
  "state-en-link-deactivated-notice-1440",
]) expected.add(`${name}.png`);
assert(expected.size === 53, `Links evidence expected capture inventory is invalid: ${expected.size}`);
for (const capture of manifest.captures) {
  const fileName = path.basename(capture.path);
  assert(expected.delete(fileName), `Links evidence contains an unexpected or duplicate capture: ${fileName}`);
  const [bytes, metadata] = await Promise.all([readFile(path.join(root, capture.path)), stat(path.join(root, capture.path))]);
  assert(metadata.size > 0 && metadata.size === capture.bytes && sha256(bytes) === capture.sha256, `Links capture hash mismatch: ${fileName}`);
}
assert(expected.size === 0, `Links evidence is missing captures: ${[...expected].join(", ")}`);

const runFiles = await readdir(runDirectory);
assert(runFiles.length === 56, `Links evidence run must contain exactly 56 files, found ${runFiles.length}.`);
assert(runFiles.filter((file) => file.endsWith(".png")).length === 53, "Links evidence run does not contain exactly 53 PNGs.");
assert(["assertions.json", "manifest.json", "review.md"].every((file) => runFiles.includes(file)), "Links evidence metadata inventory is incomplete.");

const assertionsBytes = await readFile(path.join(root, manifest.assertions));
assert(sha256(assertionsBytes) === manifest.assertionsSha256, "Links evidence assertions hash mismatch.");
const assertions = JSON.parse(assertionsBytes);
const grid = assertions.filter((entry) => typeof entry.state === "string" && /^directory-.+(?:375|768|1440)$/.test(entry.state));
assert(grid.length === 36, "Links evidence objective grid assertions are incomplete.");
const inspected = assertions.filter((entry) => entry.measured && entry.focus);
assert(inspected.length === 53, "Links evidence does not inspect all 53 captures.");
assert(inspected.every((entry) => entry.severeAxe.length === 0
  && !entry.measured.overflow
  && entry.measured.targets.every((target) => target.height >= 44 && target.width >= 44)
  && (entry.focus.outlineWidth >= 2 || entry.focus.boxShadow !== "none")), "Links evidence accessibility, target, overflow, or focus assertion failed.");

const badges = assertions.find((entry) => entry.state === "derived-badges-and-share");
assert(badges?.badges?.length === 4 && badges.shareLinks >= 5, "Links evidence does not prove the four derived badges and share URLs.");
const pagination = assertions.find((entry) => entry.state === "pagination");
assert(pagination?.firstPage === 25 && pagination.secondPage === 10 && pagination.distinct === true, "Links evidence does not prove the bounded keyset pagination.");
const unavailable = assertions.find((entry) => entry.state === "detail-unavailable");
assert(unavailable?.opaque === true, "Links evidence does not prove the opaque unavailable detail outcome.");
const invalid = assertions.find((entry) => entry.state === "invalid-query-no-echo");
assert(invalid?.echoed === false, "Links evidence does not prove the invalid-query state echoes no input.");
assert(assertions.some((entry) => entry.state === "detail-product-lines" && /^[A-Za-z0-9_-]{24}$/.test(entry.identifier ?? "")), "Links evidence does not prove the product-lines detail.");
assert(assertions.some((entry) => entry.state === "detail-fixed-amount"), "Links evidence does not prove the fixed-amount detail.");
const outcomes = Object.fromEntries(assertions.filter((entry) => typeof entry.outcome === "string").map((entry) => [entry.state, entry.outcome]));
assert(outcomes["create-product-lines"] === "created", "Links evidence does not prove the product-lines create flow.");
assert(outcomes["create-fixed-amount"] === "created", "Links evidence does not prove the fixed-amount create flow.");
assert(outcomes["edit-expiry-only-under-attempt"] === "edited", "Links evidence does not prove the dirty-omission expiry edit under an attempt.");
assert(outcomes["financial-edit-locked"] === "failed", "Links evidence does not prove the opaque attempt-locked financial edit.");
assert(outcomes.activate === "activated", "Links evidence does not prove the activation flow.");
assert(outcomes.deactivate === "deactivated", "Links evidence does not prove the deactivation flow.");
const blankClear = assertions.find((entry) => entry.state === "edit-blank-clear");
assert(blankClear?.outcome === "edited" && blankClear.cleared === true, "Links evidence does not prove the blank-clear expiry edit.");

for (const [sourcePath, expectedHash] of Object.entries(manifest.sourceHashes)) {
  assert(sha256(await readFile(path.join(root, sourcePath))) === expectedHash, `Links evidence source inventory is stale: ${sourcePath}`);
}
const manifestBytes = await readFile(path.join(root, current.manifest));
const review = await readFile(path.join(root, current.review), "utf8");
assert(review.includes(current.runId) && review.includes(sha256(manifestBytes)), "Links visual review is not bound to the current manifest.");
assert(!/unresolved severity\s*[2-4]|severity\s*[2-4]\s*:\s*(?!none)/i.test(review), "Links visual review contains an unresolved severity 2+ finding.");
console.log(`Verified merchant payment-link directory evidence ${current.runId}`);
