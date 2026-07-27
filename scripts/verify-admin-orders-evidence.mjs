import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const artifactRoot = path.join(root, "artifacts", "admin-orders");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const parse = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const current = await parse(path.join(artifactRoot, "current.json"));
assert(/^\d{14}$/.test(current.runId), "Admin orders evidence current run ID is not 14 UTC digits.");
assert(current.manifest === `artifacts/admin-orders/${current.runId}/manifest.json`, "Admin orders evidence manifest pointer is not canonical.");
assert(current.review === `artifacts/admin-orders/${current.runId}/review.md`, "Admin orders evidence review pointer is not canonical.");
const runDirectory = path.join(artifactRoot, current.runId);
const manifest = await parse(path.join(root, current.manifest));
assert(manifest.runId === current.runId, "Admin orders evidence pointer, directory, and manifest disagree.");
assert(manifest.baseCaptureCount === 36 && manifest.stateCaptureCount === 12 && manifest.totalPngCount === 48, "Admin orders evidence capture counts are not closed.");
assert(Array.isArray(manifest.captures) && manifest.captures.length === 48, "Admin orders evidence manifest does not bind 48 captures.");
assert(manifest.externalRequests.length === 0 && manifest.consoleErrors.length === 0 && manifest.pageErrors.length === 0, "Admin orders evidence records runtime or external-request failures.");

const expected = new Set();
for (const locale of ["pt-BR", "en"]) {
  for (const theme of ["pix-paper", "cashier-daylight", "settlement-sand", "midnight-clearing", "vault-blue", "terminal-amber"]) {
    for (const width of [375, 768, 1440]) expected.add(`directory-${theme}-${locale}-${width}.png`);
  }
}
for (const name of [
  "state-pt-BR-orders-empty-375",
  "state-pt-BR-orders-ready-320",
  "state-pt-BR-order-detail-1440",
  "state-pt-BR-order-detail-unavailable-1440",
  "state-pt-BR-deleted-owner-badge-1440",
  "state-en-orders-filtered-empty-1440",
  "state-en-orders-invalid-query-1440",
  "state-en-orders-page-2-1440",
  "state-en-orders-search-payer-1440",
  "state-en-orders-filter-source-1440",
  "state-en-deleted-owner-badge-1440",
  "state-en-order-detail-deleted-owner-1440",
]) expected.add(`${name}.png`);
assert(expected.size === 48, `Admin orders evidence expected capture inventory is invalid: ${expected.size}`);
for (const capture of manifest.captures) {
  const fileName = path.basename(capture.path);
  assert(expected.delete(fileName), `Admin orders evidence contains an unexpected or duplicate capture: ${fileName}`);
  const [bytes, metadata] = await Promise.all([readFile(path.join(root, capture.path)), stat(path.join(root, capture.path))]);
  assert(metadata.size > 0 && metadata.size === capture.bytes && sha256(bytes) === capture.sha256, `Admin orders capture hash mismatch: ${fileName}`);
}
assert(expected.size === 0, `Admin orders evidence is missing captures: ${[...expected].join(", ")}`);

const runFiles = await readdir(runDirectory);
assert(runFiles.length === 51, `Admin orders evidence run must contain exactly 51 files, found ${runFiles.length}.`);
assert(runFiles.filter((file) => file.endsWith(".png")).length === 48, "Admin orders evidence run does not contain exactly 48 PNGs.");
assert(["assertions.json", "manifest.json", "review.md"].every((file) => runFiles.includes(file)), "Admin orders evidence metadata inventory is incomplete.");

const assertionsBytes = await readFile(path.join(root, manifest.assertions));
assert(sha256(assertionsBytes) === manifest.assertionsSha256, "Admin orders evidence assertions hash mismatch.");
const assertions = JSON.parse(assertionsBytes);
const grid = assertions.filter((entry) => typeof entry.state === "string" && /^directory-.+(?:375|768|1440)$/.test(entry.state));
assert(grid.length === 36, "Admin orders evidence objective grid assertions are incomplete.");
const inspected = assertions.filter((entry) => entry.measured && entry.focus);
assert(inspected.length === 48, "Admin orders evidence does not inspect all 48 captures.");
assert(inspected.every((entry) => entry.severeAxe.length === 0
  && !entry.measured.overflow
  && entry.measured.targets.every((target) => target.height >= 44 && target.width >= 44)
  && (entry.focus.outlineWidth >= 2 || entry.focus.boxShadow !== "none")), "Admin orders evidence accessibility, target, overflow, or focus assertion failed.");

const facts = assertions.find((entry) => entry.state === "directory-facts");
assert(Array.isArray(facts?.owners) && facts.owners.length === 2 && facts.payer === "Ana Evidence" && facts.badges?.length === 5 && /^[A-Za-z0-9_-]{24}$/.test(facts.linkIdentifier ?? ""), "Admin orders evidence does not prove the owner, payer, badge, and link facts.");
const readOnly = assertions.find((entry) => entry.state === "detail-read-only");
assert(readOnly?.owner === "admin.orders.keep" && readOnly.comments === false && readOnly.outcomeForms === false, "Admin orders evidence does not prove the read-only administrator detail.");
const unavailable = assertions.find((entry) => entry.state === "detail-unavailable");
assert(unavailable?.opaque === true, "Admin orders evidence does not prove the opaque unavailable detail outcome.");
const softDelete = assertions.find((entry) => entry.state === "soft-delete");
assert(softDelete?.outcome === "deleted", "Admin orders evidence does not prove the delivered soft-delete route ran.");
const kept = assertions.find((entry) => entry.state === "deleted-owner-kept");
assert(kept?.owner === "admin.orders.gone" && kept.badge === "Excluída", "Admin orders evidence does not prove the deleted owner's rows stay listed with the localized badge.");
const deletedDetail = assertions.find((entry) => entry.state === "detail-deleted-owner");
assert(deletedDetail?.owner === "admin.orders.gone" && deletedDetail.badge === "Deleted", "Admin orders evidence does not prove the deleted-owner detail attribution.");
const pagination = assertions.find((entry) => entry.state === "pagination");
assert(pagination?.firstPage === 10 && pagination.secondPage === 7 && pagination.distinct === true, "Admin orders evidence does not prove the bounded keyset pagination.");
const invalid = assertions.find((entry) => entry.state === "invalid-query-no-echo");
assert(invalid?.echoed === false, "Admin orders evidence does not prove the invalid-query state echoes no input.");
const search = assertions.find((entry) => entry.state === "search-payer");
assert(search?.matched === "Ana Evidence", "Admin orders evidence does not prove the payer search.");
const filter = assertions.find((entry) => entry.state === "filter-source");
assert(filter?.source === "AD_HOC", "Admin orders evidence does not prove the source filter.");

for (const [sourcePath, expectedHash] of Object.entries(manifest.sourceHashes)) {
  assert(sha256(await readFile(path.join(root, sourcePath))) === expectedHash, `Admin orders evidence source inventory is stale: ${sourcePath}`);
}
const manifestBytes = await readFile(path.join(root, current.manifest));
const review = await readFile(path.join(root, current.review), "utf8");
assert(review.includes(current.runId) && review.includes(sha256(manifestBytes)), "Admin orders visual review is not bound to the current manifest.");
assert(!/unresolved severity\s*[2-4]|severity\s*[2-4]\s*:\s*(?!none)/i.test(review), "Admin orders visual review contains an unresolved severity 2+ finding.");
console.log(`Verified administrator global orders directory evidence ${current.runId}`);
