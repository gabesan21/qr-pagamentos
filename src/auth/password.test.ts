import { describe, expect, it, vi } from "vitest";

import { hashPassword, verifyPassword } from "./password";

const fixture = "scrypt$v=1$N=131072,r=8,p=1$AAECAwQFBgcICQoLDA0ODw$GylG2nH0EXnoO5ncM4QtFXQbh8QSHIx_N4HB34ZPtYs";

describe("password credential records", () => {
  it("verifies an exact deterministic fixture", async () => {
    await expect(verifyPassword("correct horse battery staple", fixture)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", fixture)).resolves.toBe(false);
  });

  it("hashes with a fresh canonical salt", async () => {
    const first = await hashPassword("correct horse battery staple");
    const second = await hashPassword("correct horse battery staple");
    expect(first).toMatch(/^scrypt\$v=1\$N=131072,r=8,p=1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    await expect(verifyPassword("correct horse battery staple", first)).resolves.toBe(true);
  });

  it.each([
    "bcrypt$v=1$N=131072,r=8,p=1$AAECAwQFBgcICQoLDA0ODw$gK1MmKcHUXEafO7Jlc4EZuQ6xkn3D8GHIhI_TetYHfE",
    fixture.replace("v=1", "v=2"), fixture.replace("N=131072", "N=0131072"),
    fixture.replace("r=8,p=1", "p=1,r=8"), fixture.replace("$AAE", "$AAE="),
    fixture.replace("AAECAwQFBgcICQoLDA0ODw", "AAECAwQFBgcICQoLDA0OD-"),
    fixture.replace(/\$[^$]+$/, "$short"), `${fixture}$tail`, `${fixture}é`, "x".repeat(129),
  ])("rejects malformed records uniformly: %j", async (record) => {
    const hook = vi.fn();
    await expect(verifyPassword("correct horse battery staple", record, hook)).resolves.toBe(false);
    expect(hook).not.toHaveBeenCalled();
  });
});
