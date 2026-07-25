import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const artifactRoot = path.join(root, "artifacts", "catalog");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const parse = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const current = await parse(path.join(artifactRoot, "current.json"));
assert(/^\d{14}$/.test(current.runId), "Catalog evidence current run ID is not 14 UTC digits.");
assert(current.manifest === `artifacts/catalog/${current.runId}/manifest.json`, "Catalog evidence manifest pointer is not canonical.");
assert(current.review === `artifacts/catalog/${current.runId}/review.md`, "Catalog evidence review pointer is not canonical.");
const runDirectory = path.join(artifactRoot, current.runId);
const manifest = await parse(path.join(root, current.manifest));
assert(manifest.runId === current.runId, "Catalog evidence pointer, directory, and manifest disagree.");
assert(manifest.baseCaptureCount === 36 && manifest.stateCaptureCount === 13 && manifest.totalPngCount === 49, "Catalog evidence capture counts are not closed.");
assert(Array.isArray(manifest.captures) && manifest.captures.length === 49, "Catalog evidence manifest does not bind 49 captures.");
assert(manifest.externalRequests.length === 0 && manifest.consoleErrors.length === 0 && manifest.pageErrors.length === 0, "Catalog evidence records runtime or external-request failures.");

const expected = new Set();
for (const locale of ["pt-BR", "en"]) {
  for (const theme of ["pix-paper", "cashier-daylight", "settlement-sand", "midnight-clearing", "vault-blue", "terminal-amber"]) {
    for (const width of [375, 768, 1440]) expected.add(`directory-${theme}-${locale}-${width}.png`);
  }
}
for (const name of [
  "state-pt-BR-currency-unmapped-1440",
  "state-pt-BR-products-empty-375",
  "state-pt-BR-categories-empty-375",
  "state-pt-BR-categories-ready-1440",
  "state-pt-BR-product-new-upload-staged-1440",
  "state-pt-BR-product-created-notice-1440",
  "state-pt-BR-category-deactivation-1440",
  "state-pt-BR-product-archived-1440",
  "state-en-product-new-form-1440",
  "state-en-product-edit-form-1440",
  "state-en-products-filtered-empty-1440",
  "state-en-products-invalid-query-1440",
  "state-en-category-no-replacement-1440",
]) expected.add(`${name}.png`);
assert(expected.size === 49, `Catalog evidence expected capture inventory is invalid: ${expected.size}`);
for (const capture of manifest.captures) {
  const fileName = path.basename(capture.path);
  assert(expected.delete(fileName), `Catalog evidence contains an unexpected or duplicate capture: ${fileName}`);
  const [bytes, metadata] = await Promise.all([readFile(path.join(root, capture.path)), stat(path.join(root, capture.path))]);
  assert(metadata.size > 0 && metadata.size === capture.bytes && sha256(bytes) === capture.sha256, `Catalog capture hash mismatch: ${fileName}`);
}
assert(expected.size === 0, `Catalog evidence is missing captures: ${[...expected].join(", ")}`);

const runFiles = await readdir(runDirectory);
assert(runFiles.length === 52, `Catalog evidence run must contain exactly 52 files, found ${runFiles.length}.`);
assert(runFiles.filter((file) => file.endsWith(".png")).length === 49, "Catalog evidence run does not contain exactly 49 PNGs.");
assert(["assertions.json", "manifest.json", "review.md"].every((file) => runFiles.includes(file)), "Catalog evidence metadata inventory is incomplete.");

const assertionsBytes = await readFile(path.join(root, manifest.assertions));
assert(sha256(assertionsBytes) === manifest.assertionsSha256, "Catalog evidence assertions hash mismatch.");
const assertions = JSON.parse(assertionsBytes);
const grid = assertions.filter((entry) => typeof entry.state === "string" && /^directory-.+(?:375|768|1440)$/.test(entry.state));
assert(grid.length === 36, "Catalog evidence objective grid assertions are incomplete.");
const inspected = assertions.filter((entry) => entry.measured && entry.focus);
assert(inspected.length === 49, "Catalog evidence does not inspect all 49 captures.");
assert(inspected.every((entry) => entry.severeAxe.length === 0
  && !entry.measured.overflow
  && entry.measured.targets.every((target) => target.height >= 44 && target.width >= 44)
  && (entry.focus.outlineWidth >= 2 || entry.focus.boxShadow !== "none")), "Catalog evidence accessibility, target, overflow, or focus assertion failed.");

const unmapped = assertions.find((entry) => entry.state === "currency-unmapped-disabled");
assert(unmapped?.disabled === true, "Catalog evidence does not prove the disabled currency-unmapped select.");
const staged = assertions.find((entry) => entry.state === "image-staged");
assert(staged?.stagingStatus?.length === 1 && staged.stagingStatus[0] === "200" && /^\/media\/.+$/.test(staged.preview ?? ""), "Catalog evidence does not prove one 200 staging upload and owner preview.");
const create = assertions.find((entry) => entry.state === "product-create-native-post");
assert(create?.requestCount === 1
  && create.fields?.action === "create"
  && create.fields?.currencyCode === "BRL"
  && /^[0-9a-f-]{36}$/.test(create.fields?.categoryId ?? "")
  && typeof create.fields?.imageMediaId === "string"
  && create.fields.imageMediaId === (staged.preview ?? "").replace("/media/", ""), "Catalog evidence does not prove the native create POST binds category, currency, and staged image.");
const deactivation = assertions.find((entry) => entry.state === "category-deactivation-native-post");
assert(deactivation?.requestCount === 1
  && deactivation.fields?.action === "deactivate"
  && /^[0-9a-f-]{36}$/.test(deactivation.fields?.replacementId ?? "")
  && deactivation.fields?.replacementId !== deactivation.fields?.id, "Catalog evidence does not prove the native deactivation POST binds a distinct replacement.");
const archived = assertions.find((entry) => entry.state === "archived-read-only");
assert(archived?.mutationForms === 0, "Catalog evidence does not prove the archived product view owns no mutation control.");
const noReplacement = assertions.find((entry) => entry.state === "category-no-replacement");
assert(noReplacement?.replacementSelects === 0 && noReplacement?.deactivateForms === 0, "Catalog evidence does not prove the blocked deactivation explanation.");

for (const [sourcePath, expectedHash] of Object.entries(manifest.sourceHashes)) {
  assert(sha256(await readFile(path.join(root, sourcePath))) === expectedHash, `Catalog evidence source inventory is stale: ${sourcePath}`);
}
const manifestBytes = await readFile(path.join(root, current.manifest));
const review = await readFile(path.join(root, current.review), "utf8");
assert(review.includes(current.runId) && review.includes(sha256(manifestBytes)), "Catalog visual review is not bound to the current manifest.");
assert(!/unresolved severity\s*[2-4]|severity\s*[2-4]\s*:\s*(?!none)/i.test(review), "Catalog visual review contains an unresolved severity 2+ finding.");
console.log(`Verified merchant catalog evidence ${current.runId}`);
