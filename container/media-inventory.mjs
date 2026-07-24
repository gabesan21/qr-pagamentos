import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const [inventoryPath, root = "/app/media"] = process.argv.slice(2);
if (!inventoryPath) throw new Error("inventory path is required");

const expectedObjects = new Set();
for (const line of (await readFile(inventoryPath, "utf8")).split("\n").filter(Boolean)) {
  const [storageKey, byteSizeText, digest, state] = line.split("\t");
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(storageKey)
    || !/^[1-9][0-9]*$/.test(byteSizeText)
    || !/^[a-f0-9]{64}$/.test(digest)
    || state === "WRITING"
  ) throw new Error("media inventory is not backup-safe");
  const expectedBytes = Number(byteSizeText);
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes > 5 * 1024 * 1024) {
    throw new Error("media inventory size is invalid");
  }
  expectedObjects.add(`${storageKey}.webp`);
  const descriptor = await open(
    join(root, "objects", `${storageKey}.webp`),
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const stat = await descriptor.stat();
    const bytes = Buffer.allocUnsafe(expectedBytes + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const read = await descriptor.read(bytes, offset, bytes.length - offset, null);
      if (read.bytesRead === 0) break;
      offset += read.bytesRead;
    }
    if (
      !stat.isFile()
      || stat.size !== expectedBytes
      || offset !== expectedBytes
      || createHash("sha256").update(bytes.subarray(0, offset)).digest("hex") !== digest
    ) throw new Error("media inventory digest mismatch");
  } finally {
    await descriptor.close();
  }
}
const stagingEntries = await readdir(join(root, "staging"));
const objectEntries = await readdir(join(root, "objects"));
if (
  stagingEntries.length !== 0
  || objectEntries.length !== expectedObjects.size
  || objectEntries.some((entry) => !expectedObjects.has(entry))
) {
  throw new Error("media inventory contains untracked or missing entries");
}
console.log("PASS media-backup-inventory");
