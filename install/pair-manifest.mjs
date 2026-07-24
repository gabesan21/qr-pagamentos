import { createHash } from "node:crypto";
import { chmod, lstat, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function fail(message) { throw new Error(message); }
async function artifact(path) {
  const info = await lstat(path);
  if (
    !info.isFile()
    || info.isSymbolicLink()
    || info.nlink !== 1
    || info.size < 1
    || (info.mode & 0o777) !== 0o600
  ) fail("backup artifact is invalid");
  return {
    file: basename(path),
    bytes: info.size,
    sha256: createHash("sha256").update(await readFile(path)).digest("hex"),
  };
}
function closedText(value, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) fail("manifest field is invalid");
  return value;
}
async function verifyArtifact(root, value, expectedName) {
  if (
    value?.file !== expectedName
    || !Number.isSafeInteger(value.bytes)
    || value.bytes < 1
    || !/^[a-f0-9]{64}$/.test(value.sha256)
  ) fail("manifest artifact entry is invalid");
  const actual = await artifact(resolve(root, value.file));
  if (actual.bytes !== value.bytes || actual.sha256 !== value.sha256) fail("backup checksum mismatch");
}
function verifyArchive(path) {
  const verbose = spawnSync(
    "tar",
    ["--numeric-owner", "--full-time", "--quoting-style=escape", "-tvf", path],
    { encoding: "utf8" },
  );
  if (verbose.status !== 0) fail("media archive is unreadable");
  const seen = new Set();
  for (const line of verbose.stdout.split("\n").filter(Boolean)) {
    const match = line.match(/^([dlhcbps-][rwxStTs-]{9})\s+(\d+)\/(\d+)\s+\d+\s+\S+\s+\S+\s+(.+)$/);
    if (!match) fail("media archive metadata is unreadable");
    const [, permissions, uid, gid, rawMember] = match;
    const member = rawMember.replace(/\/$/, "");
    if (
      rawMember.startsWith("/")
      || rawMember.includes("\\")
      || rawMember.includes("\0")
      || rawMember.split("/").includes("..")
      || seen.has(member)
    ) fail("media archive contains an unsafe member");
    seen.add(member);
    const isDirectory = permissions[0] === "d";
    const isObject = /^\.\/objects\/[A-Za-z0-9_-]{43}\.webp$/.test(member);
    const isControl = [".", "./staging", "./objects"].includes(member);
    if (
      uid !== "1000"
      || gid !== "1000"
      || (isDirectory && (!isControl || permissions !== "drwx------"))
      || (!isDirectory && (!isObject || permissions !== "-rw-------"))
    ) fail("media archive ownership, mode, or member contract is invalid");
  }
  if (!seen.has(".") || !seen.has("./staging") || !seen.has("./objects")) {
    fail("media archive control directories are incomplete");
  }
}

const [command, manifestPath, ...args] = process.argv.slice(2);
if (command === "create") {
  const [
    revision,
    project,
    databaseVolume,
    mediaVolume,
    databaseVolumeIdentity,
    mediaVolumeIdentity,
    applicationImage,
    databaseOperationsImage,
    databasePath,
    mediaPath,
  ] = args;
  closedText(revision, /^[a-f0-9]{40}$/);
  closedText(project, /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/);
  for (const value of [databaseVolume, mediaVolume]) closedText(value, /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/);
  for (const value of [databaseVolumeIdentity, mediaVolumeIdentity]) {
    closedText(value, /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,255}\|local\|[a-zA-Z0-9_-]+\|[a-zA-Z0-9-]+\|[^|\r\n]+$/);
  }
  if (applicationImage !== `${project}-app:${revision}` || databaseOperationsImage !== `${project}-db-ops:${revision}`) {
    fail("manifest image identity is invalid");
  }
  await chmod(databasePath, 0o600);
  await chmod(mediaPath, 0o600);
  const manifest = {
    format: "qr-pagamentos-pair-v1",
    application_revision: revision,
    application_image: applicationImage,
    database_operations_image: databaseOperationsImage,
    compose_project: project,
    database_volume: databaseVolume,
    media_volume: mediaVolume,
    database_volume_identity: databaseVolumeIdentity,
    media_volume_identity: mediaVolumeIdentity,
    schema_expectation: "prisma-migrations-complete",
    database: await artifact(databasePath),
    media: await artifact(mediaPath),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" });
} else if (command === "verify") {
  const rootInfo = await lstat(dirname(manifestPath));
  if (
    !rootInfo.isDirectory()
    || rootInfo.isSymbolicLink()
    || rootInfo.uid !== process.getuid()
    || (rootInfo.mode & 0o777) !== 0o700
  ) fail("backup set directory is invalid");
  const manifestInfo = await lstat(manifestPath);
  if (
    !manifestInfo.isFile()
    || manifestInfo.isSymbolicLink()
    || manifestInfo.nlink !== 1
    || (manifestInfo.mode & 0o777) !== 0o600
  ) fail("manifest artifact is invalid");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const keys = Object.keys(manifest).sort().join(",");
  if (keys !== "application_image,application_revision,compose_project,database,database_operations_image,database_volume,database_volume_identity,format,media,media_volume,media_volume_identity,schema_expectation") {
    fail("manifest grammar is not closed");
  }
  if (manifest.format !== "qr-pagamentos-pair-v1" || manifest.schema_expectation !== "prisma-migrations-complete") {
    fail("manifest contract is unsupported");
  }
  closedText(manifest.application_revision, /^[a-f0-9]{40}$/);
  closedText(manifest.compose_project, /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/);
  if (
    manifest.application_image !== `${manifest.compose_project}-app:${manifest.application_revision}`
    || manifest.database_operations_image !== `${manifest.compose_project}-db-ops:${manifest.application_revision}`
  ) fail("manifest image identity is invalid");
  for (const value of [manifest.database_volume, manifest.media_volume]) {
    closedText(value, /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/);
  }
  for (const value of [manifest.database_volume_identity, manifest.media_volume_identity]) {
    closedText(value, /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,255}\|local\|[a-zA-Z0-9_-]+\|[a-zA-Z0-9-]+\|[^|\r\n]+$/);
  }
  const root = dirname(manifestPath);
  await verifyArtifact(root, manifest.database, "database.dump");
  await verifyArtifact(root, manifest.media, "media.tar");
  verifyArchive(resolve(root, manifest.media.file));
  process.stdout.write(`${manifest.application_revision}\n`);
} else {
  fail("expected create or verify");
}
