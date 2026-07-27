import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const artifactRoot = path.join(root, "artifacts", "admin-users");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const parse = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const current = await parse(path.join(artifactRoot, "current.json"));
assert(/^\d{14}$/.test(current.runId), "Admin users evidence current run ID is not 14 UTC digits.");
assert(current.manifest === `artifacts/admin-users/${current.runId}/manifest.json`, "Admin users evidence manifest pointer is not canonical.");
assert(current.review === `artifacts/admin-users/${current.runId}/review.md`, "Admin users evidence review pointer is not canonical.");
const runDirectory = path.join(artifactRoot, current.runId);
const manifest = await parse(path.join(root, current.manifest));
assert(manifest.runId === current.runId, "Admin users evidence pointer, directory, and manifest disagree.");
assert(manifest.baseCaptureCount === 36 && manifest.stateCaptureCount === 12 && manifest.totalPngCount === 48, "Admin users evidence capture counts are not closed.");
assert(Array.isArray(manifest.captures) && manifest.captures.length === 48, "Admin users evidence manifest does not bind 48 captures.");
assert(manifest.externalRequests.length === 0 && manifest.consoleErrors.length === 0 && manifest.pageErrors.length === 0, "Admin users evidence records runtime or external-request failures.");

const expected = new Set();
for (const locale of ["pt-BR", "en"]) {
  for (const theme of ["pix-paper", "cashier-daylight", "settlement-sand", "midnight-clearing", "vault-blue", "terminal-amber"]) {
    for (const width of [375, 768, 1440]) expected.add(`directory-${theme}-${locale}-${width}.png`);
  }
}
for (const name of [
  "state-pt-BR-accounts-ready-375",
  "state-pt-BR-accounts-ready-320",
  "state-pt-BR-account-detail-1440",
  "state-pt-BR-account-detail-unavailable-1440",
  "state-pt-BR-deleted-badge-1440",
  "state-pt-BR-account-detail-deleted-1440",
  "state-en-accounts-filtered-empty-1440",
  "state-en-accounts-invalid-query-1440",
  "state-en-accounts-page-2-1440",
  "state-en-accounts-search-1440",
  "state-en-accounts-filter-state-1440",
  "state-en-deleted-badge-1440",
]) expected.add(`${name}.png`);
assert(expected.size === 48, `Admin users evidence expected capture inventory is invalid: ${expected.size}`);
for (const capture of manifest.captures) {
  const fileName = path.basename(capture.path);
  assert(expected.delete(fileName), `Admin users evidence contains an unexpected or duplicate capture: ${fileName}`);
  const [bytes, metadata] = await Promise.all([readFile(path.join(root, capture.path)), stat(path.join(root, capture.path))]);
  assert(metadata.size > 0 && metadata.size === capture.bytes && sha256(bytes) === capture.sha256, `Admin users capture hash mismatch: ${fileName}`);
}
assert(expected.size === 0, `Admin users evidence is missing captures: ${[...expected].join(", ")}`);

const runFiles = await readdir(runDirectory);
assert(runFiles.length === 51, `Admin users evidence run must contain exactly 51 files, found ${runFiles.length}.`);
assert(runFiles.filter((file) => file.endsWith(".png")).length === 48, "Admin users evidence run does not contain exactly 48 PNGs.");
assert(["assertions.json", "manifest.json", "review.md"].every((file) => runFiles.includes(file)), "Admin users evidence metadata inventory is incomplete.");

const assertionsBytes = await readFile(path.join(root, manifest.assertions));
assert(sha256(assertionsBytes) === manifest.assertionsSha256, "Admin users evidence assertions hash mismatch.");
const assertions = JSON.parse(assertionsBytes);
const grid = assertions.filter((entry) => typeof entry.state === "string" && /^directory-.+(?:375|768|1440)$/.test(entry.state));
assert(grid.length === 36, "Admin users evidence objective grid assertions are incomplete.");
const inspected = assertions.filter((entry) => entry.measured && entry.focus);
assert(inspected.length === 48, "Admin users evidence does not inspect all 48 captures.");
assert(inspected.every((entry) => entry.severeAxe.length === 0
  && !entry.measured.overflow
  && entry.measured.targets.every((target) => target.height >= 44 && target.width >= 44)
  && (entry.focus.outlineWidth >= 2 || entry.focus.boxShadow !== "none")), "Admin users evidence accessibility, target, overflow, or focus assertion failed.");

const facts = assertions.find((entry) => entry.state === "directory-facts");
assert(Array.isArray(facts?.users) && facts.users.length === 2 && facts.badges?.length === 2 && facts.stores?.length === 3, "Admin users evidence does not prove the user, badge, and store facts.");
const detailEditor = assertions.find((entry) => entry.state === "detail-editor");
assert(detailEditor?.user === "admin.users.keep" && detailEditor.deleteForm === true && detailEditor.editorForms === true, "Admin users evidence does not prove the administrator account detail with the profile editor forms.");
const unavailable = assertions.find((entry) => entry.state === "detail-unavailable");
assert(unavailable?.opaque === true, "Admin users evidence does not prove the opaque unavailable detail outcome.");
const softDelete = assertions.find((entry) => entry.state === "soft-delete");
assert(softDelete?.outcome === "deleted", "Admin users evidence does not prove the delivered soft-delete route ran.");
const kept = assertions.find((entry) => entry.state === "deleted-badge");
assert(kept?.user === "admin.users.gone" && kept.badge === "Excluída", "Admin users evidence does not prove the deleted account stays listed with the localized badge.");
const deletedDetail = assertions.find((entry) => entry.state === "detail-deleted");
assert(deletedDetail?.user === "admin.users.gone" && deletedDetail.badge === "Excluída" && deletedDetail.deleteForm === false, "Admin users evidence does not prove the deleted-account detail keeps the badge and drops the delete form.");
const pagination = assertions.find((entry) => entry.state === "pagination");
assert(pagination?.firstPage === 10 && pagination.secondPage === 5 && pagination.distinct === true, "Admin users evidence does not prove the bounded keyset pagination.");
const invalid = assertions.find((entry) => entry.state === "invalid-query-no-echo");
assert(invalid?.echoed === false, "Admin users evidence does not prove the invalid-query state echoes no input.");
const search = assertions.find((entry) => entry.state === "search-username");
assert(search?.matched === "admin.users.gone", "Admin users evidence does not prove the username search.");
const filterState = assertions.find((entry) => entry.state === "filter-state");
assert(filterState?.filter === "DELETED", "Admin users evidence does not prove the derived-state filter.");
const filterRole = assertions.find((entry) => entry.state === "filter-role");
assert(filterRole?.filter === "ADMIN", "Admin users evidence does not prove the role filter.");

for (const [sourcePath, expectedHash] of Object.entries(manifest.sourceHashes)) {
  assert(sha256(await readFile(path.join(root, sourcePath))) === expectedHash, `Admin users evidence source inventory is stale: ${sourcePath}`);
}
const manifestBytes = await readFile(path.join(root, current.manifest));
const review = await readFile(path.join(root, current.review), "utf8");
assert(review.includes(current.runId) && review.includes(sha256(manifestBytes)), "Admin users visual review is not bound to the current manifest.");
assert(!/unresolved severity\s*[2-4]|severity\s*[2-4]\s*:\s*(?!none)/i.test(review), "Admin users visual review contains an unresolved severity 2+ finding.");
console.log(`Verified administrator user directory evidence ${current.runId}`);
