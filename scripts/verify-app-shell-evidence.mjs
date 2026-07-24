import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const artifactRoot = join(root, "artifacts", "app-shell");
const current = JSON.parse(await readFile(join(artifactRoot, "current.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(root, current.manifest), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

if (
  manifest.runId !== current.runId
  || manifest.baseCaptureCount !== 48
  || manifest.mobileOpenCaptureCount !== 2
  || manifest.captures.length !== 50
) {
  throw new Error("App-shell evidence does not bind 48 base and two mobile-open captures.");
}
const assertions = await readFile(join(root, manifest.assertions));
if (sha256(assertions) !== manifest.assertionsSha256) throw new Error("App-shell assertions hash mismatch.");
const results = JSON.parse(assertions);
const base = results.filter((result) => result.width);
if (base.length !== 48 || base.some((result) => result.severeAxe.length > 0 || result.measured.overflow)) {
  throw new Error("App-shell objective browser assertions are incomplete or failed.");
}
for (const capture of manifest.captures) {
  const [contents, metadata] = await Promise.all([
    readFile(join(root, capture.path)),
    stat(join(root, capture.path)),
  ]);
  if (metadata.size === 0 || sha256(contents) !== capture.sha256 || metadata.mtimeMs < Date.parse(manifest.startedAt)) {
    throw new Error(`Invalid app-shell capture: ${capture.path}`);
  }
}
const manifestBytes = await readFile(join(root, current.manifest));
const review = await readFile(join(root, current.manifest.replace("manifest.json", "review.md")), "utf8");
if (
  !review.includes(manifest.runId)
  || !review.includes(sha256(manifestBytes))
  || /unresolved severity [2-4]/i.test(review)
) {
  throw new Error("App-shell review is not bound to the current manifest or still has a severity 2+ finding.");
}
console.log(`Verified app-shell evidence ${manifest.runId}`);
