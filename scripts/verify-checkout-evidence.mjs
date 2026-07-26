import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const artifactRoot = path.join(root, "artifacts", "checkout");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const parse = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const current = await parse(path.join(artifactRoot, "current.json"));
assert(/^\d{14}$/.test(current.runId), "Checkout evidence current run ID is not 14 UTC digits.");
assert(current.manifest === `artifacts/checkout/${current.runId}/manifest.json`, "Checkout evidence manifest pointer is not canonical.");
assert(current.review === `artifacts/checkout/${current.runId}/review.md`, "Checkout evidence review pointer is not canonical.");
const runDirectory = path.join(artifactRoot, current.runId);
const manifest = await parse(path.join(root, current.manifest));
assert(manifest.runId === current.runId, "Checkout evidence pointer, directory, and manifest disagree.");
assert(manifest.baseCaptureCount === 36 && manifest.stateCaptureCount === 16 && manifest.totalPngCount === 52, "Checkout evidence capture counts are not closed.");
assert(Array.isArray(manifest.captures) && manifest.captures.length === 52, "Checkout evidence manifest does not bind 52 captures.");
assert(manifest.externalRequests.length === 0 && manifest.consoleErrors.length === 0 && manifest.pageErrors.length === 0, "Checkout evidence records runtime or external-request failures.");

const expected = new Set();
for (const locale of ["pt-BR", "en"]) {
  for (const theme of ["pix-paper", "cashier-daylight", "settlement-sand", "midnight-clearing", "vault-blue", "terminal-amber"]) {
    for (const width of [375, 768, 1440]) expected.add(`checkout-${theme}-${locale}-${width}.png`);
  }
}
for (const name of [
  "state-pt-BR-fixed-none-375",
  "state-pt-BR-unavailable-1440",
  "state-pt-BR-consumed-single-use-1440",
  "state-pt-BR-checkout-320",
  "state-pt-BR-inline-validation-1440",
  "state-pt-BR-submit-pending-1440",
  "state-pt-BR-checkout-error-1440",
  "state-en-policy-email-1440",
  "state-en-policy-cpf-1440",
  "state-en-policy-cpf-address-1440",
  "state-en-qr-copy-1440",
  "state-en-status-error-1440",
  "state-en-confirmed-1440",
  "state-en-waiting-payment-data-1440",
  "state-en-rejected-1440",
  "state-en-capability-unavailable-1440",
]) expected.add(`${name}.png`);
assert(expected.size === 52, `Checkout evidence expected capture inventory is invalid: ${expected.size}`);
for (const capture of manifest.captures) {
  const fileName = path.basename(capture.path);
  assert(expected.delete(fileName), `Checkout evidence contains an unexpected or duplicate capture: ${fileName}`);
  const [bytes, metadata] = await Promise.all([readFile(path.join(root, capture.path)), stat(path.join(root, capture.path))]);
  assert(metadata.size > 0 && metadata.size === capture.bytes && sha256(bytes) === capture.sha256, `Checkout capture hash mismatch: ${fileName}`);
}
assert(expected.size === 0, `Checkout evidence is missing captures: ${[...expected].join(", ")}`);

const runFiles = await readdir(runDirectory);
assert(runFiles.length === 55, `Checkout evidence run must contain exactly 55 files, found ${runFiles.length}.`);
assert(runFiles.filter((file) => file.endsWith(".png")).length === 52, "Checkout evidence run does not contain exactly 52 PNGs.");
assert(["assertions.json", "manifest.json", "review.md"].every((file) => runFiles.includes(file)), "Checkout evidence metadata inventory is incomplete.");

const assertionsBytes = await readFile(path.join(root, manifest.assertions));
assert(sha256(assertionsBytes) === manifest.assertionsSha256, "Checkout evidence assertions hash mismatch.");
const assertions = JSON.parse(assertionsBytes);
const grid = assertions.filter((entry) => typeof entry.state === "string" && /^checkout-.+(?:375|768|1440)$/.test(entry.state));
assert(grid.length === 36, "Checkout evidence objective grid assertions are incomplete.");
const inspected = assertions.filter((entry) => entry.measured && "focus" in entry);
assert(inspected.length === 52, "Checkout evidence does not inspect all 52 captures.");
assert(inspected.every((entry) => entry.severeAxe.length === 0
  && !entry.measured.overflow
  && entry.measured.targets.every((target) => target.height >= 44 && target.width >= 44)
  && (entry.focus === null || entry.focus.outlineWidth >= 2 || entry.focus.boxShadow !== "none")), "Checkout evidence accessibility, target, overflow, or focus assertion failed.");

const byState = Object.fromEntries(assertions.filter((entry) => typeof entry.state === "string").map((entry) => [entry.state, entry]));
assert(byState["fixed-unbranded"]?.composition === "FIXED_AMOUNT" && byState["fixed-unbranded"]?.currency === "unlabeled" && byState["fixed-unbranded"]?.logo === false, "Checkout evidence does not prove the unbranded fixed-amount composition with the unlabeled treatment.");
assert(byState["product-lines-branded"]?.composition === "PRODUCT_LINES" && byState["product-lines-branded"]?.lines === 2 && byState["product-lines-branded"]?.total === "34.9" && byState["product-lines-branded"]?.currency === "BRL" && byState["product-lines-branded"]?.logo === true, "Checkout evidence does not prove the branded product-lines composition with the exact total.");
assert(byState["branding-persisted"]?.storefrontEnabled === false && byState["branding-persisted"]?.accent === "#125448" && byState["branding-persisted"]?.logo === true, "Checkout evidence does not prove persisted branding with the storefront disabled.");
assert(byState["unavailable-unknown"]?.opaque === true, "Checkout evidence does not prove the opaque unknown-identifier outcome.");
assert(byState["unavailable-consumed-single-use"]?.opaque === true && byState["unavailable-consumed-single-use"]?.paidView === false, "Checkout evidence does not prove the consumed single-use opaque unavailable outcome without a paid view.");
assert(byState["inline-validation"]?.errors === 2, "Checkout evidence does not prove the inline validation state.");
assert(byState["submit-pending"]?.busy === true && byState["submit-pending"]?.disabled === true, "Checkout evidence does not prove the submit-pending state.");
assert(byState["checkout-error"]?.opaque === true, "Checkout evidence does not prove the opaque checkout error state.");
assert(byState["policies"]?.seen?.length === 5, "Checkout evidence does not prove all five policy variants.");
assert(byState["qr-copy"]?.qrVisible === true && byState["qr-copy"]?.copy === "success", "Checkout evidence does not prove the QR and copy-feedback state.");
assert(byState["status-error-retry"]?.recovered === true, "Checkout evidence does not prove the status-error manual retry recovery.");
assert(byState["terminal-confirmed"]?.badge === "CONFIRMED", "Checkout evidence does not prove the confirmed terminal state.");
assert(byState["terminal-rejected"]?.destructive === true, "Checkout evidence does not prove the destructive terminal badge.");
assert(byState["waiting-payment-data"]?.shown === true, "Checkout evidence does not prove the waiting-for-payment-data state.");
assert(byState["expired-capability"]?.opaque === true, "Checkout evidence does not prove the expired-capability opaque unavailable outcome.");
assert(byState["branding-grid"]?.themes === 6 && byState["branding-grid"]?.locales === 2 && byState["branding-grid"]?.widths === 3, "Checkout evidence does not prove the persisted-theme grid.");

for (const [sourcePath, expectedHash] of Object.entries(manifest.sourceHashes)) {
  assert(sha256(await readFile(path.join(root, sourcePath))) === expectedHash, `Checkout evidence source inventory is stale: ${sourcePath}`);
}
const manifestBytes = await readFile(path.join(root, current.manifest));
const review = await readFile(path.join(root, current.review), "utf8");
assert(review.includes(current.runId) && review.includes(sha256(manifestBytes)), "Checkout visual review is not bound to the current manifest.");
assert(!/unresolved severity\s*[2-4]|severity\s*[2-4]\s*:\s*(?!none)/i.test(review), "Checkout visual review contains an unresolved severity 2+ finding.");
console.log(`Verified public checkout evidence ${current.runId}`);
