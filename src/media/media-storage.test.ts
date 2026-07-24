import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { link, mkdir, mkdtemp, open, readdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
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

function filesystemError(code: string) {
  return Object.assign(new Error(`simulated ${code}`), { code });
}

async function syncProbeDirectory(path: string) {
  const descriptor = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    await descriptor.sync();
  } finally {
    await descriptor.close();
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("POSIX media storage", () => {
  it("refuses a filesystem where O_EXCL opens an existing probe source", async () => {
    const directory = await root();
    let sourceExclusiveOpens = 0;
    const probeOpen = (async (path, flags, mode) => {
      if (String(path).includes(".probe-source-") && (Number(flags) & constants.O_EXCL) !== 0) {
        sourceExclusiveOpens += 1;
        if (sourceExclusiveOpens === 2) {
          return open(path, constants.O_WRONLY | constants.O_NOFOLLOW);
        }
      }
      return open(path, flags, mode);
    }) as typeof open;
    await expect(new PosixMediaStorage(directory, { probe: { open: probeOpen } }).initialize())
      .rejects.toBeInstanceOf(MediaStorageError);
    expect(sourceExclusiveOpens).toBe(2);
    expect(await readdir(join(directory, "staging"))).toEqual([]);
    expect(await readdir(join(directory, "objects"))).toEqual([]);
  });

  it("accepts only exact EEXIST for an existing probe source", async () => {
    const directory = await root();
    let sourceExclusiveOpens = 0;
    const probeOpen = (async (path, flags, mode) => {
      if (String(path).includes(".probe-source-") && (Number(flags) & constants.O_EXCL) !== 0) {
        sourceExclusiveOpens += 1;
        if (sourceExclusiveOpens === 2) throw filesystemError("EPERM");
      }
      return open(path, flags, mode);
    }) as typeof open;
    await expect(new PosixMediaStorage(directory, { probe: { open: probeOpen } }).initialize())
      .rejects.toBeInstanceOf(MediaStorageError);
  });

  it.each(["collision-succeeds", "collision-modifies-before-eexist"] as const)(
    "refuses unsupported hard-link no-clobber semantics: %s",
    async (fault) => {
      const directory = await root();
      let probeLinks = 0;
      const probeLink = (async (source, target) => {
        probeLinks += 1;
        if (probeLinks === 2) {
          await unlink(target);
          if (fault === "collision-succeeds") {
            await link(source, target);
            return;
          }
          await writeFile(target, "modified-target", { mode: 0o600 });
          throw filesystemError("EEXIST");
        }
        await link(source, target);
      }) as typeof link;
      await expect(new PosixMediaStorage(directory, { probe: { link: probeLink } }).initialize())
        .rejects.toBeInstanceOf(MediaStorageError);
      expect(probeLinks).toBe(2);
      expect(await readdir(join(directory, "staging"))).toEqual([]);
      expect(await readdir(join(directory, "objects"))).toEqual([]);
    },
  );

  it("accepts only exact EEXIST for the existing hard-link target", async () => {
    const directory = await root();
    let probeLinks = 0;
    const probeLink = (async (source, target) => {
      probeLinks += 1;
      if (probeLinks === 2) throw filesystemError("EPERM");
      await link(source, target);
    }) as typeof link;
    await expect(new PosixMediaStorage(directory, { probe: { link: probeLink } }).initialize())
      .rejects.toBeInstanceOf(MediaStorageError);
    expect(probeLinks).toBe(2);
  });

  it("refuses a filesystem where O_NOFOLLOW opens the probe symlink", async () => {
    const directory = await root();
    let followedProbeSymlink = false;
    const probeOpen = (async (path, flags, mode) => {
      if (String(path).includes(".probe-symlink-") && (Number(flags) & constants.O_NOFOLLOW) !== 0) {
        followedProbeSymlink = true;
        return open(path, constants.O_RDONLY);
      }
      return open(path, flags, mode);
    }) as typeof open;
    await expect(new PosixMediaStorage(directory, { probe: { open: probeOpen } }).initialize())
      .rejects.toBeInstanceOf(MediaStorageError);
    expect(followedProbeSymlink).toBe(true);
    expect(await readdir(join(directory, "objects"))).toEqual([]);
  });

  it("accepts only exact ELOOP for the probe symlink", async () => {
    const directory = await root();
    const probeOpen = (async (path, flags, mode) => {
      if (String(path).includes(".probe-symlink-") && (Number(flags) & constants.O_NOFOLLOW) !== 0) {
        throw filesystemError("EMLINK");
      }
      return open(path, flags, mode);
    }) as typeof open;
    await expect(new PosixMediaStorage(directory, { probe: { open: probeOpen } }).initialize())
      .rejects.toBeInstanceOf(MediaStorageError);
  });

  it("refuses cleanup failure while still syncing both controlled directories", async () => {
    const directory = await root();
    const syncs: string[] = [];
    let refusedCleanup = false;
    const probeUnlink = (async (path) => {
      if (!refusedCleanup && String(path).includes(".probe-symlink-")) {
        refusedCleanup = true;
        throw filesystemError("EACCES");
      }
      await unlink(path);
    }) as typeof unlink;
    const probeSync = async (path: string) => {
      syncs.push(path);
      await syncProbeDirectory(path);
    };
    await expect(new PosixMediaStorage(directory, {
      probe: { unlink: probeUnlink, syncDirectory: probeSync },
    }).initialize()).rejects.toBeInstanceOf(MediaStorageError);
    expect(refusedCleanup).toBe(true);
    expect(syncs.slice(-2)).toEqual([join(directory, "objects"), join(directory, "staging")]);
  });

  it("refuses cleanup that reports success but leaves probe residue", async () => {
    const directory = await root();
    let liedAboutCleanup = false;
    const probeUnlink = (async (path) => {
      if (!liedAboutCleanup && String(path).includes(".probe-symlink-")) {
        liedAboutCleanup = true;
        return;
      }
      await unlink(path);
    }) as typeof unlink;
    await expect(new PosixMediaStorage(directory, { probe: { unlink: probeUnlink } }).initialize())
      .rejects.toBeInstanceOf(MediaStorageError);
    expect(liedAboutCleanup).toBe(true);
  });

  it("attempts both cleanup directory syncs and refuses if either fails", async () => {
    const directory = await root();
    const syncs: string[] = [];
    let objectSyncCount = 0;
    const probeSync = async (path: string) => {
      syncs.push(path);
      if (path.endsWith("/objects")) {
        objectSyncCount += 1;
        if (objectSyncCount === 3) throw filesystemError("EIO");
      }
      await syncProbeDirectory(path);
    };
    await expect(new PosixMediaStorage(directory, { probe: { syncDirectory: probeSync } }).initialize())
      .rejects.toBeInstanceOf(MediaStorageError);
    expect(syncs.slice(-2)).toEqual([join(directory, "objects"), join(directory, "staging")]);
  });

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
    const reconciliationStorage = new PosixMediaStorage(directory);
    expect(await reconciliationStorage.inventory([record()])).toEqual({ untracked: [], missing: [] });
    const stagingNames = await readdir(join(directory, "staging"));
    const objectNames = await readdir(join(directory, "objects"));
    if (crashAt === "temp-written" || crashAt === "temp-synced") {
      expect(stagingNames).toHaveLength(1);
      expect(objectNames).toEqual([]);
    } else if (crashAt === "final-linked" || crashAt === "objects-synced" || crashAt === "final-verified") {
      expect(stagingNames).toHaveLength(1);
      expect(objectNames).toEqual([`${storageKey}.webp`]);
    } else {
      expect(stagingNames).toEqual([]);
      expect(objectNames).toEqual([`${storageKey}.webp`]);
    }
    await reconciliationStorage.remove(record({ state: "DELETING" }));
    expect(await readdir(join(directory, "staging"))).toEqual([]);
    expect(await readdir(join(directory, "objects"))).toEqual([]);
    expect(await reconciliationStorage.inventory([record()])).toEqual({ untracked: [], missing: [storageKey] });
  });

  it("fails closed for symlinked controlled directories", async () => {
    const directory = await root();
    await rm(join(directory, "objects"), { recursive: true });
    await symlink(join(directory, "staging"), join(directory, "objects"));
    await expect(new PosixMediaStorage(directory).initialize()).rejects.toBeInstanceOf(MediaStorageError);
  });
});
