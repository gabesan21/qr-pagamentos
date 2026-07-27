import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const artifactRoot = path.join(root, "artifacts", "standalone-payment");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const parse = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const currentPath = path.join(artifactRoot, "current.json");
const current = await parse(currentPath);
assert(/^\d{14}$/.test(current.runId), "Standalone payment evidence current run ID is not 14 UTC digits.");
assert(current.manifest === `artifacts/standalone-payment/${current.runId}/manifest.json`, "Standalone payment evidence manifest pointer is not canonical.");
assert(current.review === `artifacts/standalone-payment/${current.runId}/review.md`, "Standalone payment evidence review pointer is not canonical.");
const runDirectory = path.join(artifactRoot, current.runId);
const manifestPath = path.join(root, current.manifest);
const manifest = await parse(manifestPath);
assert(manifest.runId === current.runId, "Standalone payment evidence pointer, directory, and manifest disagree.");
assert(manifest.baseCaptureCount === 36 && manifest.interactionCaptureCount === 31 && manifest.totalPngCount === 67, "Standalone payment evidence capture counts are not closed.");
assert(Array.isArray(manifest.captures) && manifest.captures.length === 67, "Standalone payment evidence manifest does not bind 67 captures.");
assert(manifest.externalRequests.length === 0 && manifest.consoleErrors.length === 0 && manifest.pageErrors.length === 0, "Standalone payment evidence records runtime or external-request failures.");

const expected = new Set();
const sharedStates = [
  "prefill",
  "amount-invalid",
  "policy-none",
  "policy-email",
  "policy-cpf",
  "policy-address",
  "payment-waiting",
  "payment-qr",
  "payment-copy",
  "payment-status-error",
  "payment-expired",
  "payment-submit-failed",
  "pay-unavailable",
  "pay-standalone-off",
];
for (const locale of ["pt-BR", "en"]) {
  for (const theme of ["pix-paper", "cashier-daylight", "settlement-sand", "midnight-clearing", "vault-blue", "terminal-amber"]) {
    for (const width of [375, 768, 1440]) expected.add(`default-${theme}-${locale}-${width}.png`);
  }
  for (const state of sharedStates) expected.add(`interaction-${locale}-${state}.png`);
}
expected.add("interaction-pt-BR-payment-terminal-confirmed.png");
expected.add("interaction-en-payment-terminal-rejected.png");
expected.add("interaction-reflow-320.png");
assert(expected.size === 67, "Standalone payment evidence expected capture inventory is invalid.");
for (const capture of manifest.captures) {
  const fileName = path.basename(capture.path);
  assert(expected.delete(fileName), `Standalone payment evidence contains an unexpected or duplicate capture: ${fileName}`);
  const [bytes, metadata] = await Promise.all([readFile(path.join(root, capture.path)), stat(path.join(root, capture.path))]);
  assert(metadata.size > 0 && metadata.size === capture.bytes && sha256(bytes) === capture.sha256, `Standalone payment evidence capture hash mismatch: ${fileName}`);
}
assert(expected.size === 0, `Standalone payment evidence is missing captures: ${[...expected].join(", ")}`);

const runFiles = await readdir(runDirectory);
assert(runFiles.length === 70, `Standalone payment evidence run must contain exactly 70 files, found ${runFiles.length}.`);
assert(runFiles.filter((file) => file.endsWith(".png")).length === 67, "Standalone payment evidence run does not contain exactly 67 PNGs.");
assert(["assertions.json", "manifest.json", "review.md"].every((file) => runFiles.includes(file)), "Standalone payment evidence metadata inventory is incomplete.");

const assertionsBytes = await readFile(path.join(root, manifest.assertions));
assert(sha256(assertionsBytes) === manifest.assertionsSha256, "Standalone payment evidence assertions hash mismatch.");
const assertions = JSON.parse(assertionsBytes);
const base = assertions.filter((entry) => typeof entry.state === "string" && /-(?:375|768|1440)$/.test(entry.state));
assert(base.length === 36, "Standalone payment evidence objective grid assertions are incomplete.");
assert(base.every((entry) => entry.severeAxe.length === 0
  && !entry.measured.overflow
  && entry.measured.targets.length > 0
  && entry.measured.targets.every((target) => target.height >= 44 && target.width >= 44)
  && (entry.focus.outlineWidth >= 2 || entry.focus.boxShadow !== "none")), "Standalone payment evidence accessibility, target, overflow, or focus assertion failed.");

const states = (suffix) => assertions.filter((entry) => typeof entry.state === "string" && entry.state.endsWith(suffix));

const prefill = states("-prefill");
assert(prefill.length === 2 && prefill.every((entry) => entry.prefilled === "12.5"), "Standalone payment evidence does not prove the prefill-only amount in both locales.");
const amountInvalid = states("-amount-invalid");
assert(amountInvalid.length === 2 && amountInvalid.every((entry) => entry.errorVisible), "Standalone payment evidence does not prove inline amount validation in both locales.");
const policyExpectations = { "-policy-none": 0, "-policy-email": 1, "-policy-cpf": 3, "-policy-address": 9 };
for (const [suffix, fieldCount] of Object.entries(policyExpectations)) {
  const entries = states(suffix);
  assert(entries.length === 2 && entries.every((entry) => Array.isArray(entry.fields) && entry.fields.length === fieldCount), `Standalone payment evidence does not prove the ${suffix} variant in both locales.`);
}
const waiting = states("-payment-waiting");
assert(waiting.length === 2 && waiting.every((entry) => entry.waitingVisible && entry.returnLink), "Standalone payment evidence does not prove the waiting treatment with the return link.");
const qr = states("-payment-qr");
assert(qr.length === 2 && qr.every((entry) => entry.qrLoaded && entry.pixVisible), "Standalone payment evidence does not prove the loaded QR and copy-paste code through the real capability path.");
const copy = states("-payment-copy");
assert(copy.length === 2 && copy.every((entry) => entry.copied), "Standalone payment evidence does not prove copy feedback in both locales.");
const statusError = states("-payment-status-error");
assert(statusError.length === 2 && statusError.every((entry) => entry.statusErrorVisible && entry.retryVisible), "Standalone payment evidence does not prove the polling status error with manual retry.");
const confirmed = states("-payment-terminal-confirmed");
assert(confirmed.length === 1 && confirmed[0].terminal === "CONFIRMED" && confirmed[0].destructive === false && confirmed[0].returnLink, "Standalone payment evidence does not prove the CONFIRMED terminal view.");
const rejected = states("-payment-terminal-rejected");
assert(rejected.length === 1 && rejected[0].terminal === "REJECTED" && rejected[0].destructive === true && rejected[0].returnLink, "Standalone payment evidence does not prove the destructive terminal view.");
const expired = states("-payment-expired");
assert(expired.length === 2 && expired.every((entry) => entry.unavailableVisible && entry.returnLink), "Standalone payment evidence does not prove the expired-capability opaque unavailable view.");
const submitFailed = states("-payment-submit-failed");
assert(submitFailed.length === 2 && submitFailed.every((entry) => entry.errorVisible && entry.returnLink), "Standalone payment evidence does not prove the opaque submit failure.");
const unavailable = states("-pay-unavailable");
assert(unavailable.length === 2 && unavailable.every((entry) => entry.unavailableVisible && entry.noThemeAttribute), "Standalone payment evidence does not prove the opaque unscoped unavailable page.");
const standaloneOff = states("-pay-standalone-off");
assert(standaloneOff.length === 2 && standaloneOff.every((entry) => entry.unavailableVisible && entry.noThemeAttribute), "Standalone payment evidence does not prove the standalone-off unavailable page.");
const reflow = assertions.filter((entry) => entry.state === "reflow-320");
assert(reflow.length === 1 && reflow[0].reflow, "Standalone payment evidence does not prove the 320px reflow.");

for (const [sourcePath, expectedHash] of Object.entries(manifest.sourceHashes)) {
  assert(sha256(await readFile(path.join(root, sourcePath))) === expectedHash, `Standalone payment evidence source inventory is stale: ${sourcePath}`);
}
const manifestBytes = await readFile(manifestPath);
const review = await readFile(path.join(root, current.review), "utf8");
assert(review.includes(current.runId) && review.includes(sha256(manifestBytes)), "Standalone payment visual review is not bound to the current manifest.");
assert(!/unresolved severity\s*[2-4]|severity\s*[2-4]\s*:\s*(?!none)/i.test(review), "Standalone payment visual review contains an unresolved severity 2+ finding.");
console.log(`Verified standalone payment evidence ${current.runId}`);
