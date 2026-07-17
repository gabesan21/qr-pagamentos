import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const artifactRoot = join(root, "artifacts", "design-system");
const current = JSON.parse(await readFile(join(artifactRoot, "current.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(root, current.manifest), "utf8"));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (manifest.runId !== current.runId || manifest.pngs.length !== 8) throw new Error("Evidence manifest does not name exactly eight current captures.");
const assertions = await readFile(join(root, manifest.assertions));
if (sha256(assertions) !== manifest.assertionsSha256) throw new Error("Evidence assertions hash mismatch.");
for (const png of manifest.pngs) {
  const [contents, metadata] = await Promise.all([readFile(join(root, png.path)), stat(join(root, png.path))]);
  if (metadata.size === 0 || sha256(contents) !== png.sha256 || metadata.mtimeMs < Date.parse(manifest.startedAt)) throw new Error(`Invalid capture: ${png.path}`);
}
const manifestBytes = await readFile(join(root, current.manifest));
const review = await readFile(join(root, current.manifest.replace("manifest.json", "review.md")), "utf8");
if (!review.includes(manifest.runId) || !review.includes(sha256(manifestBytes)) || /unresolved severity [2-4]/i.test(review)) throw new Error("Review is not bound to the current manifest or still has a severity 2+ finding.");
console.log(`Verified design-system evidence ${manifest.runId}`);
