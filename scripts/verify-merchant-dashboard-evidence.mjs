import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const artifactRoot = path.join(root, "artifacts", "merchant-dashboard");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const parse = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const currentPath = path.join(artifactRoot, "current.json");
const current = await parse(currentPath);
assert(/^\d{14}$/.test(current.runId), "Merchant-dashboard evidence current run ID is not 14 UTC digits.");
assert(current.manifest === `artifacts/merchant-dashboard/${current.runId}/manifest.json`, "Merchant-dashboard evidence manifest pointer is not canonical.");
assert(current.review === `artifacts/merchant-dashboard/${current.runId}/review.md`, "Merchant-dashboard evidence review pointer is not canonical.");
const runDirectory = path.join(artifactRoot, current.runId);
const manifestPath = path.join(root, current.manifest);
const manifest = await parse(manifestPath);
assert(manifest.runId === current.runId, "Merchant-dashboard evidence pointer, directory, and manifest disagree.");
assert(manifest.baseCaptureCount === 36 && manifest.interactionCaptureCount === 11 && manifest.totalPngCount === 47, "Merchant-dashboard evidence capture counts are not closed.");
assert(Array.isArray(manifest.captures) && manifest.captures.length === 47, "Merchant-dashboard evidence manifest does not bind 47 captures.");
assert(manifest.externalRequests.length === 0 && manifest.consoleErrors.length === 0 && manifest.pageErrors.length === 0, "Merchant-dashboard evidence records runtime or external-request failures.");

const expected = new Set();
for (const locale of ["pt-BR", "en"]) {
  for (const theme of ["pix-paper", "cashier-daylight", "settlement-sand", "midnight-clearing", "vault-blue", "terminal-amber"]) {
    for (const width of [375, 768, 1440]) expected.add(`populated-${theme}-${locale}-${width}.png`);
  }
  for (const state of ["empty", "view-store-off", "view-store-on", "period-today", "period-30d"]) {
    expected.add(`interaction-${locale}-${state}.png`);
  }
}
expected.add("interaction-reflow-320.png");
assert(expected.size === 47, "Merchant-dashboard evidence expected capture inventory is invalid.");
for (const capture of manifest.captures) {
  const fileName = path.basename(capture.path);
  assert(expected.delete(fileName), `Merchant-dashboard evidence contains an unexpected or duplicate capture: ${fileName}`);
  const [bytes, metadata] = await Promise.all([readFile(path.join(root, capture.path)), stat(path.join(root, capture.path))]);
  assert(metadata.size > 0 && metadata.size === capture.bytes && sha256(bytes) === capture.sha256, `Merchant-dashboard capture hash mismatch: ${fileName}`);
}
assert(expected.size === 0, `Merchant-dashboard evidence is missing captures: ${[...expected].join(", ")}`);

const runFiles = await readdir(runDirectory);
assert(runFiles.length === 50, `Merchant-dashboard evidence run must contain exactly 50 files, found ${runFiles.length}.`);
assert(runFiles.filter((file) => file.endsWith(".png")).length === 47, "Merchant-dashboard evidence run does not contain exactly 47 PNGs.");
assert(["assertions.json", "manifest.json", "review.md"].every((file) => runFiles.includes(file)), "Merchant-dashboard evidence metadata inventory is incomplete.");

const assertionsBytes = await readFile(path.join(root, manifest.assertions));
assert(sha256(assertionsBytes) === manifest.assertionsSha256, "Merchant-dashboard evidence assertions hash mismatch.");
const assertions = JSON.parse(assertionsBytes);
const base = assertions.filter((entry) => typeof entry.state === "string" && /-(?:375|768|1440)$/.test(entry.state));
assert(base.length === 36, "Merchant-dashboard evidence objective grid assertions are incomplete.");
assert(base.every((entry) => entry.severeAxe.length === 0
  && !entry.measured.overflow
  && entry.measured.targets.every((target) => target.height >= 44 && target.width >= 44)
  && (entry.focus.outlineWidth >= 2 || entry.focus.boxShadow !== "none")), "Merchant-dashboard evidence accessibility, target, overflow, or focus assertion failed.");

const empty = assertions.filter((entry) => /-empty$/.test(entry.state));
assert(empty.length === 2 && empty.every((entry) => entry.emptyStates === true), "Merchant-dashboard empty-state evidence is incomplete.");

const populated = assertions.filter((entry) => /-populated-facts$/.test(entry.state));
assert(populated.length === 2, "Merchant-dashboard populated-facts evidence is incomplete.");
const ptPopulated = populated.find((entry) => entry.state === "pt-BR-populated-facts");
const enPopulated = populated.find((entry) => entry.state === "en-populated-facts");
assert(ptPopulated && enPopulated, "Merchant-dashboard populated-facts assertions are not bilingual.");
for (const [entry, confirmed, rate] of [[ptPopulated, "34,9 BRL", "50,00%"], [enPopulated, "34.9 BRL", "50.00%"]]) {
  assert(entry.confirmedAmount === confirmed && entry.localAmount === "10 BRL"
    && entry.unlabeled === true && entry.rate === rate && entry.neverSummed === true,
    "Merchant-dashboard populated evidence does not prove separate, never-summed localized sales.");
}

const storeOff = assertions.filter((entry) => /-view-store-off$/.test(entry.state));
assert(storeOff.length === 2 && storeOff.every((entry) => entry.viewStoreAbsent === true), "Merchant-dashboard View Store off evidence is incomplete.");
const storeOn = assertions.filter((entry) => /-view-store-on$/.test(entry.state));
assert(storeOn.length === 2 && storeOn.every((entry) => entry.href === "/store/dashboard-evidence-store"), "Merchant-dashboard View Store on evidence does not bind the storefront slug.");

const periods = assertions.filter((entry) => /-period-(?:today|30d)$/.test(entry.state));
assert(periods.length === 4 && periods.every((entry) => typeof entry.current === "string" && entry.current.length > 0), "Merchant-dashboard period-switching evidence is incomplete.");

const reflow = assertions.filter((entry) => entry.state === "reflow-320");
assert(reflow.length === 1 && reflow[0].reflow === true, "Merchant-dashboard 320px reflow evidence is missing.");

for (const [sourcePath, expectedHash] of Object.entries(manifest.sourceHashes)) {
  assert(sha256(await readFile(path.join(root, sourcePath))) === expectedHash, `Merchant-dashboard evidence source inventory is stale: ${sourcePath}`);
}
const manifestBytes = await readFile(manifestPath);
const review = await readFile(path.join(root, current.review), "utf8");
assert(review.includes(current.runId) && review.includes(sha256(manifestBytes)), "Merchant-dashboard visual review is not bound to the current manifest.");
assert(!/unresolved severity\s*[2-4]|severity\s*[2-4]\s*:\s*(?!none)/i.test(review), "Merchant-dashboard visual review contains an unresolved severity 2+ finding.");
console.log(`Verified merchant-dashboard evidence ${current.runId}`);
