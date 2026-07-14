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
    ["wrong prefix", fixture.replace("scrypt", "bcrypt")],
    ["wrong version", fixture.replace("v=1", "v=2")],
    ["wrong N", fixture.replace("N=131072", "N=65536")],
    ["wrong r", fixture.replace("r=8", "r=4")],
    ["wrong p", fixture.replace("p=1", "p=2")],
    ["noncanonical decimal", fixture.replace("N=131072", "N=0131072")],
    ["parameter order", fixture.replace("N=131072,r=8,p=1", "p=1,r=8,N=131072")],
    ["missing parameter field", fixture.replace("N=131072,r=8,p=1", "N=131072,r=8")],
    ["extra parameter field", fixture.replace("N=131072,r=8,p=1", "N=131072,r=8,p=1,q=1")],
    ["missing salt field", fixture.replace(/\$AAECAwQFBgcICQoLDA0ODw/, "")],
    ["missing key field", fixture.replace(/\$GylG.*$/, "")],
    ["extra record field", `${fixture}$tail`],
    ["padded salt", fixture.replace("AAECAwQFBgcICQoLDA0ODw", "AAECAwQFBgcICQoLDA0ODw==")],
    ["invalid salt alphabet", fixture.replace("AAECAwQFBgcICQoLDA0ODw", "AAECAwQFBgcICQoLDA0OD*")],
    ["noncanonical salt", fixture.replace("AAECAwQFBgcICQoLDA0ODw", "AAECAwQFBgcICQoLDA0OD-")],
    ["15-byte salt", fixture.replace("AAECAwQFBgcICQoLDA0ODw", "AAECAwQFBgcICQoLDA0O")],
    ["17-byte salt", fixture.replace("AAECAwQFBgcICQoLDA0ODw", "AAECAwQFBgcICQoLDA0ODxA")],
    ["31-byte key", fixture.replace(/GylG.*$/, "A".repeat(42))],
    ["33-byte key", fixture.replace(/GylG.*$/, "A".repeat(44))],
    ["padded key", `${fixture}=`],
    ["invalid key alphabet", fixture.replace(/s$/, "*")],
    ["noncanonical key", fixture.replace(/s$/, "t")],
    ["non-ASCII", `${fixture}é`],
    ["trailing data", `${fixture}tail`],
    ["over parser bound", "x".repeat(129)],
  ] as const)("rejects malformed records uniformly: %s", async (_name, record) => {
    const hook = vi.fn();
    await expect(verifyPassword("correct horse battery staple", record, hook)).resolves.toBe(false);
    expect(hook).not.toHaveBeenCalled();
  });
});
