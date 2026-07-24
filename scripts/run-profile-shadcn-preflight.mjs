import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const components = ["card", "alert", "field", "input", "button", "separator"];
const sourcePaths = components.map((component) => `src/components/ui/${component}.tsx`);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function hashes() {
  return Object.fromEntries(await Promise.all(sourcePaths.map(async (sourcePath) => [
    sourcePath,
    sha256(await readFile(sourcePath)),
  ])));
}

function run(args) {
  const binary = path.join(process.cwd(), "node_modules", ".bin", "shadcn");
  const result = spawnSync(binary, args, { cwd: process.cwd(), encoding: "utf8" });
  return {
    command: `shadcn ${args.join(" ")}`,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

const before = await hashes();
const commands = [
  run(["info", "--json"]),
  run(["docs", ...components]),
];
const after = await hashes();
const record = {
  version: 1,
  pinnedVersion: "4.13.0",
  components,
  commands,
  sourceHashesBefore: before,
  sourceHashesAfter: after,
  sourceDrift: JSON.stringify(before) !== JSON.stringify(after),
};

await mkdir("artifacts/profile", { recursive: true });
await writeFile("artifacts/profile/shadcn-preflight.json", `${JSON.stringify(record, null, 2)}\n`);
if (commands.some((command) => command.status !== 0)) throw new Error("Pinned shadcn profile preflight failed.");
if (record.sourceDrift) throw new Error("Pinned shadcn profile preflight changed owned source.");
console.log("Profile shadcn preflight passed without owned-source drift.");
