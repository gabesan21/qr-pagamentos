import { chmod, mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MediaPreflightError, preflightMediaStorage } from "./media-preflight.mjs";

const roots: string[] = [];

async function mediaRoot() {
  const root = await mkdtemp(join(tmpdir(), "qr-media-preflight-"));
  roots.push(root);
  await chmod(root, 0o700);
  await mkdir(join(root, "staging"), { mode: 0o700 });
  await mkdir(join(root, "objects"), { mode: 0o700 });
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("container media preflight", () => {
  it("accepts a private local POSIX root and removes its probe", async () => {
    const root = await mediaRoot();

    await expect(preflightMediaStorage(root)).resolves.toBeUndefined();
    await expect(preflightMediaStorage(root)).resolves.toBeUndefined();
  });

  it("rejects weak directory permissions", async () => {
    const root = await mediaRoot();
    await chmod(join(root, "objects"), 0o750);

    await expect(preflightMediaStorage(root)).rejects.toMatchObject<Partial<MediaPreflightError>>({
      code: "MEDIAROOT",
    });
  });

  it("rejects a symlink storage root", async () => {
    const root = await mediaRoot();
    const linked = `${root}-linked`;
    roots.push(linked);
    await symlink(root, linked);

    await expect(preflightMediaStorage(linked)).rejects.toMatchObject<Partial<MediaPreflightError>>({
      code: "MEDIAROOT",
    });
  });
});
