import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const artifactRoot = path.join(root, "artifacts", "admin-payment-links");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const parse = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const current = await parse(path.join(artifactRoot, "current.json"));
assert(/^\d{14}$/.test(current.runId), "Admin payment-links evidence current run ID is not 14 UTC digits.");
assert(current.manifest === `artifacts/admin-payment-links/${current.runId}/manifest.json`, "Admin payment-links evidence manifest pointer is not canonical.");
assert(current.review === `artifacts/admin-payment-links/${current.runId}/review.md`, "Admin payment-links evidence review pointer is not canonical.");
const runDirectory = path.join(artifactRoot, current.runId);
const manifest = await parse(path.join(root, current.manifest));
assert(manifest.runId === current.runId, "Admin payment-links evidence pointer, directory, and manifest disagree.");
assert(manifest.baseCaptureCount === 36 && manifest.stateCaptureCount === 12 && manifest.totalPngCount === 48, "Admin payment-links evidence capture counts are not closed.");
assert(Array.isArray(manifest.captures) && manifest.captures.length === 48, "Admin payment-links evidence manifest does not bind 48 captures.");
assert(manifest.externalRequests.length === 0 && manifest.consoleErrors.length === 0 && manifest.pageErrors.length === 0, "Admin payment-links evidence records runtime or external-request failures.");

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
  "state-pt-BR-deleted-owner-badge-1440",
  "state-en-links-filtered-empty-1440",
  "state-en-links-invalid-query-1440",
  "state-en-links-page-2-1440",
  "state-en-links-search-description-1440",
  "state-en-links-filter-state-1440",
  "state-en-deleted-owner-badge-1440",
  "state-en-link-detail-deleted-owner-1440",
]) expected.add(`${name}.png`);
assert(expected.size === 48, `Admin payment-links evidence expected capture inventory is invalid: ${expected.size}`);
for (const capture of manifest.captures) {
  const fileName = path.basename(capture.path);
  assert(expected.delete(fileName), `Admin payment-links evidence contains an unexpected or duplicate capture: ${fileName}`);
  const [bytes, metadata] = await Promise.all([readFile(path.join(root, capture.path)), stat(path.join(root, capture.path))]);
  assert(metadata.size > 0 && metadata.size === capture.bytes && sha256(bytes) === capture.sha256, `Admin payment-links capture hash mismatch: ${fileName}`);
}
assert(expected.size === 0, `Admin payment-links evidence is missing captures: ${[...expected].join(", ")}`);

const runFiles = await readdir(runDirectory);
assert(runFiles.length === 51, `Admin payment-links evidence run must contain exactly 51 files, found ${runFiles.length}.`);
assert(runFiles.filter((file) => file.endsWith(".png")).length === 48, "Admin payment-links evidence run does not contain exactly 48 PNGs.");
assert(["assertions.json", "manifest.json", "review.md"].every((file) => runFiles.includes(file)), "Admin payment-links evidence metadata inventory is incomplete.");

const assertionsBytes = await readFile(path.join(root, manifest.assertions));
assert(sha256(assertionsBytes) === manifest.assertionsSha256, "Admin payment-links evidence assertions hash mismatch.");
const assertions = JSON.parse(assertionsBytes);
const grid = assertions.filter((entry) => typeof entry.state === "string" && /^directory-.+(?:375|768|1440)$/.test(entry.state));
assert(grid.length === 36, "Admin payment-links evidence objective grid assertions are incomplete.");
const inspected = assertions.filter((entry) => entry.measured && entry.focus);
assert(inspected.length === 48, "Admin payment-links evidence does not inspect all 48 captures.");
assert(inspected.every((entry) => entry.severeAxe.length === 0
  && !entry.measured.overflow
  && entry.measured.targets.every((target) => target.height >= 44 && target.width >= 44)
  && (entry.focus.outlineWidth >= 2 || entry.focus.boxShadow !== "none")), "Admin payment-links evidence accessibility, target, overflow, or focus assertion failed.");

const facts = assertions.find((entry) => entry.state === "directory-facts");
assert(Array.isArray(facts?.owners) && facts.owners.length === 2
  && facts.states?.length === 4 && facts.kinds?.length === 2 && facts.types?.length === 2, "Admin payment-links evidence does not prove the owner, state, kind, and type facts.");
const readOnly = assertions.find((entry) => entry.state === "detail-read-only");
assert(readOnly?.owner === "admin.links.keep" && readOnly.drillDown === true && readOnly.mutationForms === false, "Admin payment-links evidence does not prove the read-only administrator detail with the order drill-down.");
const unavailable = assertions.find((entry) => entry.state === "detail-unavailable");
assert(unavailable?.opaque === true, "Admin payment-links evidence does not prove the opaque unavailable detail outcome.");
const softDelete = assertions.find((entry) => entry.state === "soft-delete");
assert(softDelete?.outcome === "deleted", "Admin payment-links evidence does not prove the delivered soft-delete route ran.");
const kept = assertions.find((entry) => entry.state === "deleted-owner-kept");
assert(kept?.owner === "admin.links.gone" && kept.badge === "Excluída", "Admin payment-links evidence does not prove the deleted owner's rows stay listed with the localized badge.");
const deletedDetail = assertions.find((entry) => entry.state === "detail-deleted-owner");
assert(deletedDetail?.owner === "admin.links.gone" && deletedDetail.badge === "Deleted", "Admin payment-links evidence does not prove the deleted-owner detail attribution.");
const pagination = assertions.find((entry) => entry.state === "pagination");
assert(pagination?.firstPage === 10 && pagination.secondPage === 7 && pagination.distinct === true, "Admin payment-links evidence does not prove the bounded keyset pagination.");
const invalid = assertions.find((entry) => entry.state === "invalid-query-no-echo");
assert(invalid?.echoed === false, "Admin payment-links evidence does not prove the invalid-query state echoes no input.");
const search = assertions.find((entry) => entry.state === "search-description");
assert(search?.matched === "Monthly donation", "Admin payment-links evidence does not prove the description search.");
const filter = assertions.find((entry) => entry.state === "filter-state");
assert(filter?.filtered === "expired", "Admin payment-links evidence does not prove the lifecycle-state filter.");

for (const [sourcePath, expectedHash] of Object.entries(manifest.sourceHashes)) {
  assert(sha256(await readFile(path.join(root, sourcePath))) === expectedHash, `Admin payment-links evidence source inventory is stale: ${sourcePath}`);
}
const manifestBytes = await readFile(path.join(root, current.manifest));
const review = await readFile(path.join(root, current.review), "utf8");
assert(review.includes(current.runId) && review.includes(sha256(manifestBytes)), "Admin payment-links visual review is not bound to the current manifest.");
assert(!/unresolved severity\s*[2-4]|severity\s*[2-4]\s*:\s*(?!none)/i.test(review), "Admin payment-links visual review contains an unresolved severity 2+ finding.");
console.log(`Verified administrator global payment-links directory evidence ${current.runId}`);
