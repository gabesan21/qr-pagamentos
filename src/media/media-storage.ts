import "server-only";

import { createHash, randomBytes } from "node:crypto";
import {
  constants,
  link,
  lstat,
  open,
  readdir,
  realpath,
  unlink,
} from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { MAX_MEDIA_BYTES, MEDIA_IDENTIFIER_PATTERN, type MediaRecord } from "./types";

const READ_BOUND = MAX_MEDIA_BYTES + 1;
const PRIVATE_MODE_MASK = 0o077;
const TEMP_PATTERN = /^([A-Za-z0-9_-]{43})\.[A-Za-z0-9_-]{16}\.tmp$/;
const FINAL_PATTERN = /^([A-Za-z0-9_-]{43})\.webp$/;

export type StorageStep =
  | "temp-written"
  | "temp-synced"
  | "final-linked"
  | "objects-synced"
  | "final-verified"
  | "temp-unlinked"
  | "staging-synced";

export type StorageInventory = Readonly<{
  untracked: readonly string[];
  missing: readonly string[];
}>;

export class MediaStorageError extends Error {}

type StorageOptions = Readonly<{
  onStep?: (step: StorageStep) => void | Promise<void>;
}>;

async function syncDirectory(path: string): Promise<void> {
  const descriptor = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    await descriptor.sync();
  } finally {
    await descriptor.close();
  }
}

async function readBoundedDescriptor(
  descriptor: Awaited<ReturnType<typeof open>>,
  expectedBytes: number,
  expectedDigest: string,
): Promise<Buffer> {
  const file = await descriptor.stat();
  if (!file.isFile() || file.size !== expectedBytes || expectedBytes < 1 || expectedBytes > MAX_MEDIA_BYTES) {
    throw new MediaStorageError("Stored media identity is unavailable");
  }
  const bytes = Buffer.allocUnsafe(READ_BOUND);
  let length = 0;
  while (length < READ_BOUND) {
    const { bytesRead } = await descriptor.read(bytes, length, READ_BOUND - length, null);
    if (bytesRead === 0) break;
    length += bytesRead;
  }
  const body = bytes.subarray(0, length);
  if (
    length !== expectedBytes
    || length > MAX_MEDIA_BYTES
    || createHash("sha256").update(body).digest("hex") !== expectedDigest
  ) {
    throw new MediaStorageError("Stored media identity is unavailable");
  }
  return Buffer.from(body);
}

async function requirePrivateDirectory(path: string, expectedDevice?: bigint): Promise<bigint> {
  const entry = await lstat(path, { bigint: true });
  if (!entry.isDirectory() || entry.isSymbolicLink() || (entry.mode & BigInt(PRIVATE_MODE_MASK)) !== BigInt(0)) {
    throw new MediaStorageError("Media storage directory is unsupported");
  }
  if (expectedDevice !== undefined && entry.dev !== expectedDevice) {
    throw new MediaStorageError("Media storage directories must share one device");
  }
  return entry.dev;
}

function finalName(storageKey: string): string {
  if (!MEDIA_IDENTIFIER_PATTERN.test(storageKey)) throw new MediaStorageError("Storage key is invalid");
  return `${storageKey}.webp`;
}

export class PosixMediaStorage {
  readonly root: string;
  readonly stagingDirectory: string;
  readonly objectsDirectory: string;
  private initialized = false;

  constructor(root: string, private readonly options: StorageOptions = {}) {
    if (!isAbsolute(root) || resolve(root) !== root || root === "/") {
      throw new MediaStorageError("MEDIA_STORAGE_ROOT must be a canonical absolute directory");
    }
    this.root = root;
    this.stagingDirectory = join(root, "staging");
    this.objectsDirectory = join(root, "objects");
  }

  private async step(step: StorageStep) {
    await this.options.onStep?.(step);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (await realpath(this.root) !== this.root) throw new MediaStorageError("MEDIA_STORAGE_ROOT may not be a symlink");
    const rootDevice = await requirePrivateDirectory(this.root);
    await requirePrivateDirectory(this.stagingDirectory, rootDevice);
    await requirePrivateDirectory(this.objectsDirectory, rootDevice);

    const probeKey = randomBytes(12).toString("base64url");
    const source = join(this.stagingDirectory, `.probe-${probeKey}`);
    const target = join(this.objectsDirectory, `.probe-${probeKey}`);
    let descriptor: Awaited<ReturnType<typeof open>> | undefined;
    try {
      descriptor = await open(
        source,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
        0o600,
      );
      await descriptor.writeFile("probe");
      await descriptor.sync();
      await link(source, target);
      await syncDirectory(this.objectsDirectory);
      const targetDescriptor = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        if (!(await targetDescriptor.stat()).isFile()) throw new MediaStorageError("Media storage probe is not regular");
      } finally {
        await targetDescriptor.close();
      }
    } catch {
      throw new MediaStorageError("Media storage does not provide required local POSIX semantics");
    } finally {
      await descriptor?.close().catch(() => undefined);
      await unlink(target).catch(() => undefined);
      await unlink(source).catch(() => undefined);
      await syncDirectory(this.objectsDirectory).catch(() => undefined);
      await syncDirectory(this.stagingDirectory).catch(() => undefined);
    }
    this.initialized = true;
  }

  async publish(record: MediaRecord, bytes: Buffer): Promise<void> {
    await this.initialize();
    if (
      record.state !== "WRITING"
      || bytes.length !== Number(record.byteSize)
      || createHash("sha256").update(bytes).digest("hex") !== record.sha256
    ) {
      throw new MediaStorageError("Reserved metadata does not match canonical bytes");
    }

    const suffix = randomBytes(12).toString("base64url");
    const temporaryPath = join(this.stagingDirectory, `${record.storageKey}.${suffix}.tmp`);
    const publishedPath = join(this.objectsDirectory, finalName(record.storageKey));
    const temporary = await open(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await temporary.writeFile(bytes);
      await this.step("temp-written");
      await temporary.sync();
      await this.step("temp-synced");
      const temporaryStat = await temporary.stat();
      if (!temporaryStat.isFile() || temporaryStat.size !== bytes.length) {
        throw new MediaStorageError("Temporary media is inconsistent");
      }
      await link(temporaryPath, publishedPath);
      await this.step("final-linked");
      await syncDirectory(this.objectsDirectory);
      await this.step("objects-synced");
      const published = await open(publishedPath, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        await readBoundedDescriptor(published, bytes.length, record.sha256);
      } finally {
        await published.close();
      }
      await this.step("final-verified");
      await unlink(temporaryPath);
      await this.step("temp-unlinked");
      await syncDirectory(this.stagingDirectory);
      await this.step("staging-synced");
    } finally {
      await temporary.close();
    }
  }

  async read(record: MediaRecord): Promise<Buffer> {
    await this.initialize();
    const descriptor = await open(
      join(this.objectsDirectory, finalName(record.storageKey)),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    ).catch(() => null);
    if (!descriptor) throw new MediaStorageError("Stored media is unavailable");
    try {
      return await readBoundedDescriptor(descriptor, Number(record.byteSize), record.sha256);
    } finally {
      await descriptor.close();
    }
  }

  async remove(record: MediaRecord): Promise<void> {
    await this.initialize();
    const finalPath = join(this.objectsDirectory, finalName(record.storageKey));
    await unlink(finalPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    const staging = await readdir(this.stagingDirectory);
    for (const name of staging) {
      if (TEMP_PATTERN.exec(name)?.[1] !== record.storageKey) continue;
      await unlink(join(this.stagingDirectory, name));
    }
    await syncDirectory(this.objectsDirectory);
    await syncDirectory(this.stagingDirectory);
  }

  async inventory(records: readonly MediaRecord[]): Promise<StorageInventory> {
    await this.initialize();
    const tracked = new Map(records.map((record) => [record.storageKey, record]));
    const present = new Set<string>();
    const untracked: string[] = [];
    const objectEntries = await readdir(this.objectsDirectory, { withFileTypes: true });
    for (const entry of objectEntries) {
      const key = FINAL_PATTERN.exec(entry.name)?.[1];
      if (!key || !tracked.has(key) || !entry.isFile()) {
        untracked.push(`objects/${entry.name}`);
        continue;
      }
      const record = tracked.get(key)!;
      const descriptor = await open(
        join(this.objectsDirectory, entry.name),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      ).catch(() => null);
      if (!descriptor) {
        untracked.push(`objects/${entry.name}`);
        continue;
      }
      try {
        await readBoundedDescriptor(descriptor, Number(record.byteSize), record.sha256);
        present.add(key);
      } catch {
        untracked.push(`objects/${entry.name}`);
      } finally {
        await descriptor.close();
      }
    }
    const stagingEntries = await readdir(this.stagingDirectory, { withFileTypes: true });
    for (const entry of stagingEntries) {
      const key = TEMP_PATTERN.exec(entry.name)?.[1];
      if (!key || !tracked.has(key) || !entry.isFile() || tracked.get(key)!.state !== "WRITING") {
        untracked.push(`staging/${entry.name}`);
        continue;
      }
      const record = tracked.get(key)!;
      const descriptor = await open(
        join(this.stagingDirectory, entry.name),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      ).catch(() => null);
      if (!descriptor) {
        untracked.push(`staging/${entry.name}`);
        continue;
      }
      try {
        await readBoundedDescriptor(descriptor, Number(record.byteSize), record.sha256);
        present.add(key);
      } catch {
        untracked.push(`staging/${entry.name}`);
      } finally {
        await descriptor.close();
      }
    }
    const missing = records.filter((record) => !present.has(record.storageKey)).map((record) => record.storageKey);
    return { untracked, missing };
  }
}

export function createConfiguredMediaStorage(): PosixMediaStorage {
  const root = process.env.MEDIA_STORAGE_ROOT;
  if (!root) throw new MediaStorageError("MEDIA_STORAGE_ROOT is required");
  return new PosixMediaStorage(root);
}
