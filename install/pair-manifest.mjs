import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function fail(message) { throw new Error(message); }
async function artifact(path) {
  const info = await stat(path);
  if (!info.isFile() || info.size < 1) fail("backup artifact is invalid");
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
  const listed = spawnSync("tar", ["-tf", path], { encoding: "utf8" });
  const verbose = spawnSync("tar", ["-tvf", path], { encoding: "utf8" });
  if (listed.status !== 0 || verbose.status !== 0) fail("media archive is unreadable");
  for (const member of listed.stdout.split("\n").filter(Boolean)) {
    if (member.startsWith("/") || member.split("/").includes("..") || member.includes("\0")) {
      fail("media archive contains an unsafe member");
    }
  }
  for (const line of verbose.stdout.split("\n").filter(Boolean)) {
    if (!["-", "d"].includes(line[0])) fail("media archive contains a link or special file");
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
    databasePath,
    mediaPath,
  ] = args;
  closedText(revision, /^[a-f0-9]{40}$/);
  closedText(project, /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/);
  for (const value of [databaseVolume, mediaVolume]) closedText(value, /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/);
  for (const value of [databaseVolumeIdentity, mediaVolumeIdentity]) {
    closedText(value, /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,255}\|local\|[a-zA-Z0-9_-]+\|[a-zA-Z0-9-]+\|[^|\r\n]+$/);
  }
  const manifest = {
    format: "qr-pagamentos-pair-v1",
    application_revision: revision,
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
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const keys = Object.keys(manifest).sort().join(",");
  if (keys !== "application_revision,compose_project,database,database_volume,database_volume_identity,format,media,media_volume,media_volume_identity,schema_expectation") {
    fail("manifest grammar is not closed");
  }
  if (manifest.format !== "qr-pagamentos-pair-v1" || manifest.schema_expectation !== "prisma-migrations-complete") {
    fail("manifest contract is unsupported");
  }
  closedText(manifest.application_revision, /^[a-f0-9]{40}$/);
  closedText(manifest.compose_project, /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/);
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
