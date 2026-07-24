import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { MediaStorageError, PosixMediaStorage, type StorageStep } from "./media-storage";
import type { MediaRecord } from "./types";

const roots: string[] = [];
const bytes = Buffer.from("canonical-webp");
const storageKey = "s".repeat(43);

function record(override: Partial<MediaRecord> = {}): MediaRecord {
  const timestamp = new Date("2026-07-23T12:00:00Z");
  return {
    id: "11111111-1111-4111-8111-111111111111",
    identifier: "i".repeat(43),
    storageKey,
    ownerId: "22222222-2222-4222-8222-222222222222",
    purpose: "PRODUCT_IMAGE",
    state: "WRITING",
    lifecycleRevision: BigInt(0),
    mimeType: "image/webp",
    byteSize: BigInt(bytes.length),
    width: 1,
    height: 1,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    purgeAfter: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...override,
  };
}

async function root() {
  const directory = await mkdtemp(join(tmpdir(), "qr-media-"));
  roots.push(directory);
  await mkdir(join(directory, "staging"), { mode: 0o700 });
  await mkdir(join(directory, "objects"), { mode: 0o700 });
  return directory;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("POSIX media storage", () => {
  it("probes and executes the crash-durable no-clobber publication order", async () => {
    const steps: StorageStep[] = [];
    const storage = new PosixMediaStorage(await root(), { onStep: (step) => { steps.push(step); } });
    await storage.publish(record(), bytes);
    expect(steps).toEqual([
      "temp-written",
      "temp-synced",
      "final-linked",
      "objects-synced",
      "final-verified",
      "temp-unlinked",
      "staging-synced",
    ]);
    expect(await storage.read(record({ state: "STAGED" }))).toEqual(bytes);
  });

  it("never clobbers an existing final object", async () => {
    const directory = await root();
    await writeFile(join(directory, "objects", `${storageKey}.webp`), "existing", { mode: 0o600 });
    const storage = new PosixMediaStorage(directory);
    await expect(storage.publish(record(), bytes)).rejects.toMatchObject({ code: "EEXIST" });
    expect(await storage.inventory([record()])).toEqual({ untracked: [`objects/${storageKey}.webp`], missing: [] });
  });

  it("rejects same-size corruption from the already-opened descriptor", async () => {
    const directory = await root();
    const storage = new PosixMediaStorage(directory);
    await storage.publish(record(), bytes);
    await writeFile(join(directory, "objects", `${storageKey}.webp`), Buffer.alloc(bytes.length, 1));
    await expect(storage.read(record({ state: "ACTIVE" }))).rejects.toBeInstanceOf(MediaStorageError);
  });

  it("rejects a final-name symlink swap without following it", async () => {
    const directory = await root();
    const storage = new PosixMediaStorage(directory);
    await storage.publish(record(), bytes);
    const finalPath = join(directory, "objects", `${storageKey}.webp`);
    await unlink(finalPath);
    const alternate = join(directory, "alternate.webp");
    await writeFile(alternate, bytes);
    await symlink(alternate, finalPath);
    await expect(storage.read(record({ state: "ACTIVE" }))).rejects.toBeInstanceOf(MediaStorageError);
  });

  it.each([
    "temp-written",
    "temp-synced",
    "final-linked",
    "objects-synced",
    "final-verified",
    "temp-unlinked",
    "staging-synced",
  ] as const)("leaves a %s crash unavailable to metadata publication and visible to reconciliation", async (crashAt) => {
    const directory = await root();
    const storage = new PosixMediaStorage(directory, {
      onStep(step) {
        if (step === crashAt) throw new Error("simulated crash");
      },
    });
    await expect(storage.publish(record(), bytes)).rejects.toThrow("simulated crash");
    const inventory = await new PosixMediaStorage(directory).inventory([record()]);
    expect(inventory.untracked).toEqual([]);
    expect(inventory.missing.length).toBe(crashAt === "temp-written" ? 0 : 0);
  });

  it("fails closed for symlinked controlled directories", async () => {
    const directory = await root();
    await rm(join(directory, "objects"), { recursive: true });
    await symlink(join(directory, "staging"), join(directory, "objects"));
    await expect(new PosixMediaStorage(directory).initialize()).rejects.toBeInstanceOf(MediaStorageError);
  });
});
