import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const artifactRoot = path.join(root, "artifacts", "profile");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const parse = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const currentPath = path.join(artifactRoot, "current.json");
const current = await parse(currentPath);
assert(/^\d{14}$/.test(current.runId), "Profile evidence current run ID is not 14 UTC digits.");
assert(current.manifest === `artifacts/profile/${current.runId}/manifest.json`, "Profile evidence manifest pointer is not canonical.");
assert(current.review === `artifacts/profile/${current.runId}/review.md`, "Profile evidence review pointer is not canonical.");
const runDirectory = path.join(artifactRoot, current.runId);
const manifestPath = path.join(root, current.manifest);
const manifest = await parse(manifestPath);
assert(manifest.runId === current.runId, "Profile evidence pointer, directory, and manifest disagree.");
assert(manifest.baseCaptureCount === 36 && manifest.interactionCaptureCount === 14 && manifest.totalPngCount === 50, "Profile evidence capture counts are not closed.");
assert(Array.isArray(manifest.captures) && manifest.captures.length === 50, "Profile evidence manifest does not bind 50 captures.");
assert(manifest.externalRequests.length === 0 && manifest.consoleErrors.length === 0 && manifest.pageErrors.length === 0, "Profile evidence records runtime or external-request failures.");

const expected = new Set();
for (const locale of ["pt-BR", "en"]) {
  for (const theme of ["pix-paper", "cashier-daylight", "settlement-sand", "midnight-clearing", "vault-blue", "terminal-amber"]) {
    for (const width of [375, 768, 1440]) expected.add(`default-${theme}-${locale}-${width}.png`);
  }
  for (const state of ["identity-changed", "identity-conflict", "identity-failed", "identity-pending", "password-failed", "password-pending", "password-changed-login"]) {
    expected.add(`interaction-${locale}-${state}.png`);
  }
}
assert(expected.size === 50, "Profile evidence expected capture inventory is invalid.");
for (const capture of manifest.captures) {
  const fileName = path.basename(capture.path);
  assert(expected.delete(fileName), `Profile evidence contains an unexpected or duplicate capture: ${fileName}`);
  const [bytes, metadata] = await Promise.all([readFile(path.join(root, capture.path)), stat(path.join(root, capture.path))]);
  assert(metadata.size > 0 && metadata.size === capture.bytes && sha256(bytes) === capture.sha256, `Profile capture hash mismatch: ${fileName}`);
}
assert(expected.size === 0, `Profile evidence is missing captures: ${[...expected].join(", ")}`);

const runFiles = await readdir(runDirectory);
assert(runFiles.length === 53, `Profile evidence run must contain exactly 53 files, found ${runFiles.length}.`);
assert(runFiles.filter((file) => file.endsWith(".png")).length === 50, "Profile evidence run does not contain exactly 50 PNGs.");
assert(["assertions.json", "manifest.json", "review.md"].every((file) => runFiles.includes(file)), "Profile evidence metadata inventory is incomplete.");

const assertionsBytes = await readFile(path.join(root, manifest.assertions));
assert(sha256(assertionsBytes) === manifest.assertionsSha256, "Profile evidence assertions hash mismatch.");
const assertions = JSON.parse(assertionsBytes);
const base = assertions.filter((entry) => typeof entry.state === "string" && /-(?:375|768|1440)$/.test(entry.state));
assert(base.length === 36, "Profile evidence objective grid assertions are incomplete.");
assert(base.every((entry) => entry.severeAxe.length === 0
  && !entry.measured.overflow
  && entry.measured.targets.every((target) => target.height >= 44 && target.width >= 44)
  && (entry.focus.outlineWidth >= 2 || entry.focus.boxShadow !== "none")), "Profile evidence accessibility, target, overflow, or focus assertion failed.");
const pending = assertions.filter((entry) => /-(?:identity|password)-pending$/.test(entry.state));
assert(pending.length === 4 && pending.every((entry) => entry.requestCount === 1 && entry.immediateBusy && entry.disabledScope), "Profile pending evidence does not prove one native request and immediate disabled feedback.");
const pendingTriggers = new Set(pending.map((entry) => `${entry.state.split("-").slice(-2, -1)[0]}:${entry.trigger}`));
assert(["identity:click", "identity:enter", "password:click", "password:enter"].every((key) => pendingTriggers.has(key)), "Profile pending evidence does not cover click and Enter for both forms.");
const submissions = assertions.filter((entry) => /-submission-contract$/.test(entry.state));
assert(submissions.length === 2 && submissions.every((entry) => entry.identityChangedRequests === 1
  && entry.passwordFailedRequests === 1
  && entry.expiryCookie
  && entry.seededSessionsRejected === 2
  && entry.oldPasswordRejected
  && entry.newPasswordAccepted), "Profile credential/session browser proof is incomplete.");

for (const [sourcePath, expectedHash] of Object.entries(manifest.sourceHashes)) {
  assert(sha256(await readFile(path.join(root, sourcePath))) === expectedHash, `Profile evidence source inventory is stale: ${sourcePath}`);
}
const manifestBytes = await readFile(manifestPath);
const review = await readFile(path.join(root, current.review), "utf8");
assert(review.includes(current.runId) && review.includes(sha256(manifestBytes)), "Profile visual review is not bound to the current manifest.");
assert(!/unresolved severity\s*[2-4]|severity\s*[2-4]\s*:\s*(?!none)/i.test(review), "Profile visual review contains an unresolved severity 2+ finding.");
console.log(`Verified merchant profile evidence ${current.runId}`);
