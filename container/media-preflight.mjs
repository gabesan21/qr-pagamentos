import { randomBytes } from "node:crypto";
import {
  constants,
  link,
  lstat,
  open,
  realpath,
  symlink,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const MEDIA_STORAGE_ROOT = "/app/media";

const EXPECTED_ID = 1000;
const PRIVATE_MODE = 0o700;
const PROBE_BYTES = Buffer.from("media-preflight");

export class MediaPreflightError extends Error {
  constructor(code) {
    super("media preflight failed");
    this.code = code;
  }
}

function errorCode(error) {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : undefined;
}

async function expectFailure(operation, expectedCode, dispose) {
  try {
    const result = await operation();
    await dispose?.(result);
  } catch (error) {
    if (errorCode(error) === expectedCode) return;
    throw error;
  }
  throw new MediaPreflightError("MEDIASEMANTIC");
}

async function syncDirectory(path) {
  const descriptor = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    await descriptor.sync();
  } finally {
    await descriptor.close();
  }
}

async function requirePrivateDirectory(path, expectedDevice) {
  const entry = await lstat(path, { bigint: true });
  if (
    !entry.isDirectory()
    || entry.isSymbolicLink()
    || Number(entry.uid) !== EXPECTED_ID
    || Number(entry.gid) !== EXPECTED_ID
    || (Number(entry.mode) & 0o777) !== PRIVATE_MODE
    || (expectedDevice !== undefined && entry.dev !== expectedDevice)
  ) {
    throw new MediaPreflightError("MEDIAROOT");
  }
  return entry.dev;
}

async function readExactDescriptor(descriptor, expected) {
  const bytes = Buffer.allocUnsafe(expected.length + 1);
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesRead } = await descriptor.read(bytes, offset, bytes.length - offset, null);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  if (offset !== expected.length || !bytes.subarray(0, offset).equals(expected)) {
    throw new MediaPreflightError("MEDIASEMANTIC");
  }
}

async function removeProbe(paths, directories) {
  let failed = false;
  for (const path of paths) {
    try {
      await unlink(path);
    } catch (error) {
      if (errorCode(error) !== "ENOENT") failed = true;
    }
  }
  for (const path of paths) {
    try {
      await lstat(path);
      failed = true;
    } catch (error) {
      if (errorCode(error) !== "ENOENT") failed = true;
    }
  }
  for (const directory of directories) {
    try {
      await syncDirectory(directory);
    } catch {
      failed = true;
    }
  }
  if (failed) throw new MediaPreflightError("MEDIACLEANUP");
}

export async function preflightMediaStorage(root = MEDIA_STORAGE_ROOT) {
  if (root !== await realpath(root)) throw new MediaPreflightError("MEDIAROOT");
  const rootDevice = await requirePrivateDirectory(root);
  const staging = join(root, "staging");
  const objects = join(root, "objects");
  await requirePrivateDirectory(staging, rootDevice);
  await requirePrivateDirectory(objects, rootDevice);

  const suffix = randomBytes(12).toString("base64url");
  const source = join(staging, `.runtime-probe-source-${suffix}`);
  const target = join(objects, `.runtime-probe-target-${suffix}`);
  const collision = join(objects, `.runtime-probe-collision-${suffix}`);
  const symbolic = join(objects, `.runtime-probe-symlink-${suffix}`);
  const paths = [symbolic, collision, target, source];
  const exclusive = constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW;
  let sourceDescriptor;
  let failure;

  try {
    sourceDescriptor = await open(source, exclusive, 0o600);
    await sourceDescriptor.writeFile(PROBE_BYTES);
    await sourceDescriptor.sync();
    const sourceIdentity = await sourceDescriptor.stat({ bigint: true });
    await expectFailure(() => open(source, exclusive, 0o600), "EEXIST", (value) => value.close());

    await link(source, target);
    await syncDirectory(objects);
    const targetDescriptor = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const targetIdentity = await targetDescriptor.stat({ bigint: true });
      if (
        !targetIdentity.isFile()
        || targetIdentity.dev !== sourceIdentity.dev
        || targetIdentity.ino !== sourceIdentity.ino
      ) {
        throw new MediaPreflightError("MEDIASEMANTIC");
      }
      await readExactDescriptor(targetDescriptor, PROBE_BYTES);
    } finally {
      await targetDescriptor.close();
    }

    const collisionDescriptor = await open(collision, exclusive, 0o600);
    try {
      await collisionDescriptor.writeFile("existing");
      await collisionDescriptor.sync();
    } finally {
      await collisionDescriptor.close();
    }
    await syncDirectory(objects);
    await expectFailure(() => link(source, collision), "EEXIST");
    const unchanged = await open(collision, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      await readExactDescriptor(unchanged, Buffer.from("existing"));
    } finally {
      await unchanged.close();
    }

    await symlink(target, symbolic);
    await expectFailure(
      () => open(symbolic, constants.O_RDONLY | constants.O_NOFOLLOW),
      "ELOOP",
      (value) => value.close(),
    );
  } catch (error) {
    failure = error;
  } finally {
    try {
      await sourceDescriptor?.close();
    } catch {
      failure = new MediaPreflightError("MEDIACLEANUP");
    }
    try {
      await removeProbe(paths, [objects, staging]);
    } catch (error) {
      failure = error;
    }
  }

  if (failure) {
    if (failure instanceof MediaPreflightError) throw failure;
    throw new MediaPreflightError("MEDIASEMANTIC");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  preflightMediaStorage()
    .then(() => console.log("PASS media-preflight"))
    .catch((error) => {
      const code = error instanceof MediaPreflightError ? error.code : "MEDIAFAILED";
      console.error(`ERROR media-preflight code=${code}`);
      process.exitCode = 1;
    });
}
