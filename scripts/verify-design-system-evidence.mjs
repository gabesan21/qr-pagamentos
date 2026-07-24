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

if (manifest.runId !== current.runId || manifest.pngs.length !== 24) throw new Error("Evidence manifest does not name exactly 24 current captures.");
if (manifest.themes?.join(",") !== "pix-paper,cashier-daylight,settlement-sand,midnight-clearing,vault-blue,terminal-amber") throw new Error("Evidence manifest theme inventory is incomplete.");
if (manifest.fallback?.actual !== manifest.fallback?.expected) throw new Error("Unknown-theme fallback does not match pix-paper.");
const assertions = await readFile(join(root, manifest.assertions));
if (sha256(assertions) !== manifest.assertionsSha256) throw new Error("Evidence assertions hash mismatch.");
const brandManifest = await readFile(join(root, manifest.brandManifest?.path ?? ""));
if (sha256(brandManifest) !== manifest.brandManifest?.sha256) throw new Error("Evidence does not bind the current brand manifest.");
for (const png of manifest.pngs) {
  const [contents, metadata] = await Promise.all([readFile(join(root, png.path)), stat(join(root, png.path))]);
  if (metadata.size === 0 || sha256(contents) !== png.sha256 || metadata.mtimeMs < Date.parse(manifest.startedAt)) throw new Error(`Invalid capture: ${png.path}`);
}
const manifestBytes = await readFile(join(root, current.manifest));
const review = await readFile(join(root, current.manifest.replace("manifest.json", "review.md")), "utf8");
if (!review.includes(manifest.runId) || !review.includes(sha256(manifestBytes)) || /unresolved severity [2-4]/i.test(review)) throw new Error("Review is not bound to the current manifest or still has a severity 2+ finding.");
console.log(`Verified design-system evidence ${manifest.runId}`);
