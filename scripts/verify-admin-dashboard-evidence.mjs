import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const artifactRoot = path.join(root, "artifacts", "admin-dashboard");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const parse = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const currentPath = path.join(artifactRoot, "current.json");
const current = await parse(currentPath);
assert(/^\d{14}$/.test(current.runId), "Admin-dashboard evidence current run ID is not 14 UTC digits.");
assert(current.manifest === `artifacts/admin-dashboard/${current.runId}/manifest.json`, "Admin-dashboard evidence manifest pointer is not canonical.");
assert(current.review === `artifacts/admin-dashboard/${current.runId}/review.md`, "Admin-dashboard evidence review pointer is not canonical.");
const runDirectory = path.join(artifactRoot, current.runId);
const manifestPath = path.join(root, current.manifest);
const manifest = await parse(manifestPath);
assert(manifest.runId === current.runId, "Admin-dashboard evidence pointer, directory, and manifest disagree.");
assert(manifest.baseCaptureCount === 36 && manifest.interactionCaptureCount === 9 && manifest.totalPngCount === 45, "Admin-dashboard evidence capture counts are not closed.");
assert(Array.isArray(manifest.captures) && manifest.captures.length === 45, "Admin-dashboard evidence manifest does not bind 45 captures.");
assert(manifest.externalRequests.length === 0 && manifest.consoleErrors.length === 0 && manifest.pageErrors.length === 0, "Admin-dashboard evidence records runtime or external-request failures.");

const expected = new Set();
for (const locale of ["pt-BR", "en"]) {
  for (const theme of ["pix-paper", "cashier-daylight", "settlement-sand", "midnight-clearing", "vault-blue", "terminal-amber"]) {
    for (const width of [375, 768, 1440]) expected.add(`populated-${theme}-${locale}-${width}.png`);
  }
  for (const state of ["empty", "period-today", "period-30d", "deleted-badge"]) {
    expected.add(`interaction-${locale}-${state}.png`);
  }
}
expected.add("interaction-reflow-320.png");
assert(expected.size === 45, "Admin-dashboard evidence expected capture inventory is invalid.");
for (const capture of manifest.captures) {
  const fileName = path.basename(capture.path);
  assert(expected.delete(fileName), `Admin-dashboard evidence contains an unexpected or duplicate capture: ${fileName}`);
  const [bytes, metadata] = await Promise.all([readFile(path.join(root, capture.path)), stat(path.join(root, capture.path))]);
  assert(metadata.size > 0 && metadata.size === capture.bytes && sha256(bytes) === capture.sha256, `Admin-dashboard evidence capture hash mismatch: ${fileName}`);
}
assert(expected.size === 0, `Admin-dashboard evidence is missing captures: ${[...expected].join(", ")}`);

const runFiles = await readdir(runDirectory);
assert(runFiles.length === 48, `Admin-dashboard evidence run must contain exactly 48 files, found ${runFiles.length}.`);
assert(runFiles.filter((file) => file.endsWith(".png")).length === 45, "Admin-dashboard evidence run does not contain exactly 45 PNGs.");
assert(["assertions.json", "manifest.json", "review.md"].every((file) => runFiles.includes(file)), "Admin-dashboard evidence metadata inventory is incomplete.");

const assertionsBytes = await readFile(path.join(root, manifest.assertions));
assert(sha256(assertionsBytes) === manifest.assertionsSha256, "Admin-dashboard evidence assertions hash mismatch.");
const assertions = JSON.parse(assertionsBytes);
const base = assertions.filter((entry) => typeof entry.state === "string" && /-(?:375|768|1440)$/.test(entry.state));
assert(base.length === 36, "Admin-dashboard evidence objective grid assertions are incomplete.");
assert(base.every((entry) => entry.severeAxe.length === 0
  && !entry.measured.overflow
  && entry.measured.targets.every((target) => target.height >= 44 && target.width >= 44)
  && (entry.focus.outlineWidth >= 2 || entry.focus.boxShadow !== "none")), "Admin-dashboard evidence accessibility, target, overflow, or focus assertion failed.");

const empty = assertions.filter((entry) => /-empty$/.test(entry.state));
assert(empty.length === 2 && empty.every((entry) => entry.emptyStates === true && entry.periodIndependentCaption === true), "Admin-dashboard empty-state evidence is incomplete.");

const populated = assertions.filter((entry) => /-populated-facts$/.test(entry.state));
assert(populated.length === 2, "Admin-dashboard populated-facts evidence is incomplete.");
const ptPopulated = populated.find((entry) => entry.state === "pt-BR-populated-facts");
const enPopulated = populated.find((entry) => entry.state === "en-populated-facts");
assert(ptPopulated && enPopulated, "Admin-dashboard populated-facts assertions are not bilingual.");
for (const [entry, confirmed, rate, badge] of [
  [ptPopulated, "62,65 BRL", "66,66%", "Excluído"],
  [enPopulated, "62.65 BRL", "66.66%", "Deleted"],
]) {
  assert(entry.confirmedAmount === confirmed && entry.localAmount === "10 BRL"
    && entry.unlabeled === true && entry.rate === rate && entry.neverSummed === true
    && entry.stateNone === true && entry.standalone === true && entry.deletedBadge === badge,
    "Admin-dashboard populated evidence does not prove separate, never-summed localized sales with explicit states.");
}

const periods = assertions.filter((entry) => /-period-(?:today|30d)$/.test(entry.state));
assert(periods.length === 4 && periods.every((entry) => typeof entry.current === "string" && entry.current.length > 0), "Admin-dashboard period-switching evidence is incomplete.");

const deletedBadge = assertions.filter((entry) => /-deleted-badge$/.test(entry.state));
assert(deletedBadge.length === 2 && deletedBadge.every((entry) => typeof entry.badge === "string" && entry.badge.length > 0), "Admin-dashboard deleted-owner badge evidence is incomplete.");

const softDelete = assertions.filter((entry) => entry.state === "soft-delete");
assert(softDelete.length === 1 && softDelete[0].outcome === "deleted", "Admin-dashboard soft-delete evidence is missing.");

const reflow = assertions.filter((entry) => entry.state === "reflow-320");
assert(reflow.length === 1 && reflow[0].reflow === true, "Admin-dashboard 320px reflow evidence is missing.");

for (const [sourcePath, expectedHash] of Object.entries(manifest.sourceHashes)) {
  assert(sha256(await readFile(path.join(root, sourcePath))) === expectedHash, `Admin-dashboard evidence source inventory is stale: ${sourcePath}`);
}
const manifestBytes = await readFile(manifestPath);
const review = await readFile(path.join(root, current.review), "utf8");
assert(review.includes(current.runId) && review.includes(sha256(manifestBytes)), "Admin-dashboard visual review is not bound to the current manifest.");
assert(!/unresolved severity\s*[2-4]|severity\s*[2-4]\s*:\s*(?!none)/i.test(review), "Admin-dashboard visual review contains an unresolved severity 2+ finding.");
console.log(`Verified admin-dashboard evidence ${current.runId}`);
