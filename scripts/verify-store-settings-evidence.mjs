import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const artifactRoot = path.join(root, "artifacts", "store-settings");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const parse = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const currentPath = path.join(artifactRoot, "current.json");
const current = await parse(currentPath);
assert(/^\d{14}$/.test(current.runId), "Store-settings evidence current run ID is not 14 UTC digits.");
assert(current.manifest === `artifacts/store-settings/${current.runId}/manifest.json`, "Store-settings evidence manifest pointer is not canonical.");
assert(current.review === `artifacts/store-settings/${current.runId}/review.md`, "Store-settings evidence review pointer is not canonical.");
const runDirectory = path.join(artifactRoot, current.runId);
const manifestPath = path.join(root, current.manifest);
const manifest = await parse(manifestPath);
assert(manifest.runId === current.runId, "Store-settings evidence pointer, directory, and manifest disagree.");
assert(manifest.baseCaptureCount === 36 && manifest.interactionCaptureCount === 15 && manifest.totalPngCount === 51, "Store-settings evidence capture counts are not closed.");
assert(Array.isArray(manifest.captures) && manifest.captures.length === 51, "Store-settings evidence manifest does not bind 51 captures.");
assert(manifest.externalRequests.length === 0 && manifest.consoleErrors.length === 0 && manifest.pageErrors.length === 0, "Store-settings evidence records runtime or external-request failures.");

const expected = new Set();
for (const locale of ["pt-BR", "en"]) {
  for (const theme of ["pix-paper", "cashier-daylight", "settlement-sand", "midnight-clearing", "vault-blue", "terminal-amber"]) {
    for (const width of [375, 768, 1440]) expected.add(`default-${theme}-${locale}-${width}.png`);
  }
  for (const state of ["currency-disabled", "currency-enabled", "logo-failed", "logo-staged", "logo-removed-fallback", "save-pending", "keyboard"]) {
    expected.add(`interaction-${locale}-${state}.png`);
  }
}
expected.add("interaction-currency-unchanged-save.png");
assert(expected.size === 51, "Store-settings evidence expected capture inventory is invalid.");
for (const capture of manifest.captures) {
  const fileName = path.basename(capture.path);
  assert(expected.delete(fileName), `Store-settings evidence contains an unexpected or duplicate capture: ${fileName}`);
  const [bytes, metadata] = await Promise.all([readFile(path.join(root, capture.path)), stat(path.join(root, capture.path))]);
  assert(metadata.size > 0 && metadata.size === capture.bytes && sha256(bytes) === capture.sha256, `Store-settings capture hash mismatch: ${fileName}`);
}
assert(expected.size === 0, `Store-settings evidence is missing captures: ${[...expected].join(", ")}`);

const runFiles = await readdir(runDirectory);
assert(runFiles.length === 54, `Store-settings evidence run must contain exactly 54 files, found ${runFiles.length}.`);
assert(runFiles.filter((file) => file.endsWith(".png")).length === 51, "Store-settings evidence run does not contain exactly 51 PNGs.");
assert(["assertions.json", "manifest.json", "review.md"].every((file) => runFiles.includes(file)), "Store-settings evidence metadata inventory is incomplete.");

const assertionsBytes = await readFile(path.join(root, manifest.assertions));
assert(sha256(assertionsBytes) === manifest.assertionsSha256, "Store-settings evidence assertions hash mismatch.");
const assertions = JSON.parse(assertionsBytes);
const base = assertions.filter((entry) => typeof entry.state === "string" && /-(?:375|768|1440)$/.test(entry.state));
assert(base.length === 36, "Store-settings evidence objective grid assertions are incomplete.");
assert(base.every((entry) => entry.severeAxe.length === 0
  && !entry.measured.overflow
  && entry.measured.targets.every((target) => target.height >= 44 && target.width >= 44)
  && (entry.focus.outlineWidth >= 2 || entry.focus.boxShadow !== "none")), "Store-settings evidence accessibility, target, overflow, or focus assertion failed.");

const isNativeDocumentPost = (request) => request?.nativeDocument
  && request.resourceType === "document"
  && /^application\/x-www-form-urlencoded(?:;|$)/.test(request.contentType);

const pending = assertions.filter((entry) => /-save-pending$/.test(entry.state));
assert(pending.length === 2 && pending.every((entry) => entry.requestCount === 1
  && entry.immediateBusy
  && entry.disabledScope
  && isNativeDocumentPost(entry.request)), "Store-settings pending evidence does not prove one native document POST and immediate disabled feedback.");
const pendingTriggers = new Set(pending.map((entry) => entry.trigger));
assert(pendingTriggers.has("click") && pendingTriggers.has("enter"), "Store-settings pending evidence does not cover click and Enter submission.");
const ptPending = pending.find((entry) => entry.state === "pt-BR-save-pending");
const enPending = pending.find((entry) => entry.state === "en-save-pending");
assert(ptPending && enPending, "Store-settings pending assertions are not bilingual.");
assert(ptPending.request.fields.storefrontDefaultCurrencyCode === "BRL", "The first save must submit the newly assigned currency.");
assert(!("storefrontThemeId" in ptPending.request.fields) && !("storefrontLayout" in ptPending.request.fields)
  && !("storefrontStandalonePaymentsEnabled" in ptPending.request.fields), "Unchanged extended fields must be omitted from the payload.");
assert(!("storefrontDefaultCurrencyCode" in enPending.request.fields), "An unchanged stored currency must be omitted from the payload.");
for (const entry of pending) {
  assert("storefrontSlug" in entry.request.fields && "storefrontLogoMediaIdentifier" in entry.request.fields
    && /^[A-Za-z0-9_-]{43}$/.test(entry.request.fields.storefrontLogoMediaIdentifier), "The save payload must bind the staged logo identifier.");
}

const staged = assertions.filter((entry) => /-logo-staged$/.test(entry.state));
assert(staged.length === 2 && staged.every((entry) => /^[A-Za-z0-9_-]{43}$/.test(entry.identifier)
  && entry.imageLoaded
  && /^multipart\/form-data/.test(entry.uploadContentType)), "Store-settings staged-logo evidence does not prove a multipart upload and an owner-readable staged preview.");

const currencyStates = assertions.filter((entry) => /-currency-(?:disabled|enabled)$/.test(entry.state));
assert(currencyStates.length === 4, "Store-settings currency state evidence is incomplete.");
assert(currencyStates.filter((entry) => entry.state.endsWith("-disabled")).every((entry) => entry.disabled && typeof entry.explanation === "string" && entry.explanation.length > 0), "Store-settings disabled currency state is not explained.");
assert(currencyStates.filter((entry) => entry.state.endsWith("-enabled")).every((entry) => entry.enabled && entry.optionCount === 2 && entry.selected === "BRL"), "Store-settings enabled currency state does not list the active mapping.");

const removed = assertions.filter((entry) => /-logo-removed-fallback$/.test(entry.state));
assert(removed.length === 2 && removed.every((entry) => entry.fallbackVisible), "Store-settings remove evidence does not show the official fallback.");

const keyboard = assertions.filter((entry) => /-keyboard$/.test(entry.state));
assert(keyboard.length === 2 && keyboard.every((entry) => Array.isArray(entry.focusOrder)
  && entry.focusOrder.join(",") === "storefront-slug,storefront-display-name-pt-br,storefront-display-name-en,storefront-theme,storefront-layout"), "Store-settings keyboard traversal does not follow the rendered control order.");

const unchangedSave = assertions.filter((entry) => entry.state === "currency-unchanged-save");
assert(unchangedSave.length === 1 && unchangedSave[0].outcome === "changed" && isNativeDocumentPost(unchangedSave[0].request), "Store-settings unchanged-currency save did not succeed natively.");
for (const field of ["storefrontDefaultCurrencyCode", "storefrontThemeId", "storefrontLayout", "storefrontStandalonePaymentsEnabled"]) {
  assert(!(field in unchangedSave[0].request.fields), `The since-deactivated unchanged ${field} must be omitted from the save payload.`);
}
assert("storefrontSlug" in unchangedSave[0].request.fields, "Store-settings legacy fields must keep their always-submit semantics.");

for (const [sourcePath, expectedHash] of Object.entries(manifest.sourceHashes)) {
  assert(sha256(await readFile(path.join(root, sourcePath))) === expectedHash, `Store-settings evidence source inventory is stale: ${sourcePath}`);
}
const manifestBytes = await readFile(manifestPath);
const review = await readFile(path.join(root, current.review), "utf8");
assert(review.includes(current.runId) && review.includes(sha256(manifestBytes)), "Store-settings visual review is not bound to the current manifest.");
assert(!/unresolved severity\s*[2-4]|severity\s*[2-4]\s*:\s*(?!none)/i.test(review), "Store-settings visual review contains an unresolved severity 2+ finding.");
console.log(`Verified store-settings evidence ${current.runId}`);
