import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const artifactRoot = path.join(root, "artifacts", "storefront");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const parse = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const currentPath = path.join(artifactRoot, "current.json");
const current = await parse(currentPath);
assert(/^\d{14}$/.test(current.runId), "Storefront evidence current run ID is not 14 UTC digits.");
assert(current.manifest === `artifacts/storefront/${current.runId}/manifest.json`, "Storefront evidence manifest pointer is not canonical.");
assert(current.review === `artifacts/storefront/${current.runId}/review.md`, "Storefront evidence review pointer is not canonical.");
const runDirectory = path.join(artifactRoot, current.runId);
const manifestPath = path.join(root, current.manifest);
const manifest = await parse(manifestPath);
assert(manifest.runId === current.runId, "Storefront evidence pointer, directory, and manifest disagree.");
assert(manifest.baseCaptureCount === 36 && manifest.interactionCaptureCount === 23 && manifest.totalPngCount === 59, "Storefront evidence capture counts are not closed.");
assert(Array.isArray(manifest.captures) && manifest.captures.length === 59, "Storefront evidence manifest does not bind 59 captures.");
assert(manifest.externalRequests.length === 0 && manifest.consoleErrors.length === 0 && manifest.pageErrors.length === 0, "Storefront evidence records runtime or external-request failures.");

const expected = new Set();
for (const locale of ["pt-BR", "en"]) {
  for (const theme of ["pix-paper", "cashier-daylight", "settlement-sand", "midnight-clearing", "vault-blue", "terminal-amber"]) {
    for (const width of [375, 768, 1440]) expected.add(`default-${theme}-${locale}-${width}.png`);
  }
  for (const state of ["logo-fallback", "table", "cart-added", "cart-quantity", "cart-reload", "cart-recovered", "cart-checkout", "cart-checkout-failed", "standalone-off", "empty", "unavailable"]) {
    expected.add(`interaction-${locale}-${state}.png`);
  }
}
expected.add("interaction-reflow-320.png");
assert(expected.size === 59, "Storefront evidence expected capture inventory is invalid.");
for (const capture of manifest.captures) {
  const fileName = path.basename(capture.path);
  assert(expected.delete(fileName), `Storefront evidence contains an unexpected or duplicate capture: ${fileName}`);
  const [bytes, metadata] = await Promise.all([readFile(path.join(root, capture.path)), stat(path.join(root, capture.path))]);
  assert(metadata.size > 0 && metadata.size === capture.bytes && sha256(bytes) === capture.sha256, `Storefront evidence capture hash mismatch: ${fileName}`);
}
assert(expected.size === 0, `Storefront evidence is missing captures: ${[...expected].join(", ")}`);

const runFiles = await readdir(runDirectory);
assert(runFiles.length === 62, `Storefront evidence run must contain exactly 62 files, found ${runFiles.length}.`);
assert(runFiles.filter((file) => file.endsWith(".png")).length === 59, "Storefront evidence run does not contain exactly 59 PNGs.");
assert(["assertions.json", "manifest.json", "review.md"].every((file) => runFiles.includes(file)), "Storefront evidence metadata inventory is incomplete.");

const assertionsBytes = await readFile(path.join(root, manifest.assertions));
assert(sha256(assertionsBytes) === manifest.assertionsSha256, "Storefront evidence assertions hash mismatch.");
const assertions = JSON.parse(assertionsBytes);
const base = assertions.filter((entry) => typeof entry.state === "string" && /-(?:375|768|1440)$/.test(entry.state));
assert(base.length === 36, "Storefront evidence objective grid assertions are incomplete.");
assert(base.every((entry) => entry.severeAxe.length === 0
  && !entry.measured.overflow
  && entry.measured.targets.length > 0
  && entry.measured.targets.every((target) => target.height >= 44 && target.width >= 44)
  && (entry.focus.outlineWidth >= 2 || entry.focus.boxShadow !== "none")), "Storefront evidence accessibility, target, overflow, or focus assertion failed.");

const states = (suffix) => assertions.filter((entry) => typeof entry.state === "string" && entry.state.endsWith(suffix));

const fallback = states("-logo-fallback");
assert(fallback.length === 2 && fallback.every((entry) => entry.fallbackVisible), "Storefront evidence does not show the official fallback before the logo.");
const logo = states("-logo");
assert(logo.length === 2 && logo.every((entry) => entry.imageLoaded), "Storefront evidence does not prove a loaded public logo in both locales.");

const added = states("-cart-added");
assert(added.length === 2 && added.every((entry) => entry.cartLines === 2 && entry.customAmount === "5" && entry.productQuantity === 1 && entry.total === "17.5"), "Storefront cart-add evidence does not bind the exact first totals.");
const quantity = states("-cart-quantity");
assert(quantity.length === 2 && quantity.every((entry) => entry.productQuantity === 2 && entry.total === "30" && entry.neverSummed), "Storefront cart-quantity evidence does not bind the exact updated totals.");
const reload = states("-cart-reload");
assert(reload.length === 2 && reload.every((entry) => entry.persisted && entry.productQuantity === 2 && entry.total === "30"), "Storefront cart evidence does not prove reload persistence.");
const recovered = states("-cart-recovered");
assert(recovered.length === 2 && recovered.every((entry) => typeof entry.notice === "string" && entry.notice.length > 0 && entry.droppedStale && entry.productQuantity === 2), "Storefront cart evidence does not prove stale-item recovery with the localized notice.");
const checkoutHidden = states("-cart-checkout-hidden");
assert(checkoutHidden.length === 2 && checkoutHidden.every((entry) => entry.customAmountPresent && entry.controlAbsent), "Storefront cart checkout evidence does not prove the control is absent with a custom-amount item.");
const checkout = assertions.filter((entry) => typeof entry.state === "string" && entry.state.endsWith("-cart-checkout"));
assert(checkout.length === 2 && checkout.every((entry) => entry.controlVisible && entry.productOnly), "Storefront cart checkout evidence does not prove the control on a product-only cart.");
const checkoutFailed = states("-cart-checkout-failed");
assert(checkoutFailed.length === 2 && checkoutFailed.every((entry) => typeof entry.notice === "string" && entry.notice.length > 0 && entry.cartIntact), "Storefront cart checkout evidence does not prove the opaque failure keeps the cart intact.");
const checkoutIssued = states("-cart-checkout-issued");
assert(checkoutIssued.length === 2 && checkoutIssued.every((entry) => entry.redirected && entry.cartCleared), "Storefront cart checkout evidence does not prove issuance clears the cart and redirects.");

const table = states("-table");
assert(table.length === 2 && table.every((entry) => entry.tableLayout), "Storefront evidence does not cover the table layout in both locales.");
const standaloneOff = states("-standalone-off");
assert(standaloneOff.length === 2 && standaloneOff.every((entry) => entry.customAmountAbsent), "Storefront evidence does not prove the standalone item disappears when off.");
const empty = states("-empty");
assert(empty.length === 2 && empty.every((entry) => entry.emptyVisible), "Storefront evidence does not cover the empty store in both locales.");
const unavailable = states("-unavailable");
assert(unavailable.length === 2 && unavailable.every((entry) => entry.unavailableVisible && entry.noThemeAttribute), "Storefront evidence does not prove the opaque unscoped unavailable state.");
const reflow = assertions.filter((entry) => entry.state === "reflow-320");
assert(reflow.length === 1 && reflow[0].reflow, "Storefront evidence does not prove the 320px reflow.");

for (const [sourcePath, expectedHash] of Object.entries(manifest.sourceHashes)) {
  assert(sha256(await readFile(path.join(root, sourcePath))) === expectedHash, `Storefront evidence source inventory is stale: ${sourcePath}`);
}
const manifestBytes = await readFile(manifestPath);
const review = await readFile(path.join(root, current.review), "utf8");
assert(review.includes(current.runId) && review.includes(sha256(manifestBytes)), "Storefront visual review is not bound to the current manifest.");
assert(!/unresolved severity\s*[2-4]|severity\s*[2-4]\s*:\s*(?!none)/i.test(review), "Storefront visual review contains an unresolved severity 2+ finding.");
console.log(`Verified storefront evidence ${current.runId}`);
