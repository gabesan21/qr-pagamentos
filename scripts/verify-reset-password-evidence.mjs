import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const artifactRoot = join(root, "artifacts", "reset-password");
const current = JSON.parse(await readFile(join(artifactRoot, "current.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(root, current.manifest), "utf8"));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assert(condition, message) { if (!condition) throw new Error(message); }

assert(manifest.runId === current.runId, "Reset-password evidence manifest does not match the current run.");
assert(/^\d{14}$/.test(manifest.runId), "Reset-password evidence run ID is not 14 UTC digits.");
assert(typeof manifest.tokenDigestPrefixes?.ptBr === "string" && manifest.tokenDigestPrefixes.ptBr.length === 16, "Reset-password evidence manifest must bind a redacted pt-BR token digest prefix.");
assert(typeof manifest.tokenDigestPrefixes?.en === "string" && manifest.tokenDigestPrefixes.en.length === 16, "Reset-password evidence manifest must bind a redacted en token digest prefix.");
assert(typeof manifest.userId === "string" && manifest.userId.length > 0, "Reset-password evidence manifest must bind the seeded user id.");

const assertions = await readFile(join(root, manifest.assertions));
assert(sha256(assertions) === manifest.assertionsSha256, "Reset-password evidence assertions hash mismatch.");
const records = JSON.parse(assertions);

const expectedStates = [
  "invalid-pt-BR", "invalid-en",
  "valid-pt-BR-375", "valid-pt-BR-768", "valid-pt-BR-1440",
  "valid-en-375", "valid-en-768", "valid-en-1440",
  "error-pt-BR", "error-en",
  "success-pt-BR", "success-en",
];
assert(records.length === expectedStates.length, `Reset-password evidence assertions count mismatch: ${records.length}`);
for (const state of expectedStates) {
  const record = records.find((entry) => entry.state === state);
  assert(record, `Reset-password evidence is missing state ${state}`);
  assert(Array.isArray(record.severeAxe) && record.severeAxe.length === 0, `Reset-password evidence state ${state} has serious/critical axe violations.`);
  if (state.startsWith("valid-")) {
    assert(record.formVisible === true, `Reset-password evidence state ${state} must show the form.`);
    assert(record.measured?.overflow === false, `Reset-password evidence state ${state} must not overflow.`);
    assert(record.measured?.targets.every((target) => target.height >= 44 && target.width >= 44), `Reset-password evidence state ${state} has sub-44px targets.`);
  }
  if (state.startsWith("invalid-")) {
    assert(record.formVisible === false, `Reset-password evidence state ${state} must hide the form.`);
  }
  if (state.startsWith("success-")) {
    assert(record.changed === true, `Reset-password evidence state ${state} must mark a successful rotation.`);
  }
}

assert(manifest.pngs.length === expectedStates.length, "Reset-password evidence manifest does not bind the expected captures.");
const seen = new Set();
for (const png of manifest.pngs) {
  const fileName = png.path.split("/").pop();
  assert(!seen.has(fileName), `Reset-password evidence contains a duplicate capture: ${fileName}`);
  seen.add(fileName);
  const [contents, metadata] = await Promise.all([readFile(join(root, png.path)), stat(join(root, png.path))]);
  assert(metadata.size > 0 && metadata.size === png.bytes && sha256(contents) === png.sha256, `Reset-password evidence capture hash mismatch: ${fileName}`);
}

const review = await readFile(join(root, current.review), "utf8");
const manifestBytes = await readFile(join(root, current.manifest));
assert(review.includes(manifest.runId) && review.includes(sha256(manifestBytes)), "Reset-password visual review is not bound to the current manifest.");
assert(!/unresolved severity\s*[2-4]|severity\s*[2-4]\s*:\s*(?!none)/i.test(review), "Reset-password visual review contains an unresolved severity 2+ finding.");

console.log(`Verified reset-password evidence ${manifest.runId}`);
