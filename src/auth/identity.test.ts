import { describe, expect, it } from "vitest";

import { normalizeEmail, toUserDto, validatePassword } from "./identity";

describe("identity input contracts", () => {
  it.each([
    [" Admin.Example+ops@Example.COM ", "admin.example+ops@example.com"],
    ["a@b.co", "a@b.co"],
    [`${"a".repeat(64)}@b.co`, `${"a".repeat(64)}@b.co`],
    [`a@${"b".repeat(63)}.co`, `a@${"b".repeat(63)}.co`],
  ])("canonicalizes %s", (input, canonical) => {
    expect(normalizeEmail(input)).toBe(canonical);
  });

  it.each([
    "admin@example.com\0", "admin@example.com\r", "admin@example.com\n",
    "á@example.com", "a @example.com", "aexample.com", "a@@example.com",
    ".a@example.com", "a.@example.com", "a..b@example.com", "a@example",
    "a@.example.com", "a@example..com", "a@-example.com", "a@example-.com",
    `${"a".repeat(65)}@b.co`, `a@${"b".repeat(64)}.co`, "a@example.c",
    `a@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.${"e".repeat(59)}.com`,
  ])("rejects invalid email without echoing it: %j", (input) => {
    expect(() => normalizeEmail(input)).toThrowError("Invalid email address");
    try { normalizeEmail(input); } catch (error) { expect(String(error)).not.toContain(input); }
  });

  it.each(["abcdefghijkl", "            ", "á".repeat(12), "😀".repeat(12), "x".repeat(128)])(
    "accepts 12-128 Unicode code points without composition rules",
    (password) => expect(validatePassword(password)).toBe(password),
  );

  it.each(["x".repeat(11), "x".repeat(129), "😀".repeat(129)])("rejects password length %j", (password) => {
    expect(() => validatePassword(password)).toThrowError("Password must contain 12 to 128 characters");
  });
});

describe("safe user DTO", () => {
  it("selects only outward identity fields", () => {
    const createdAt = new Date("2026-07-14T00:00:00Z");
    expect(toUserDto({
      id: "user-id", email: "admin@example.com", role: "ADMIN", status: "ACTIVE", createdAt,
      passwordHash: "forbidden", internalAuthorization: "forbidden",
    })).toEqual({ id: "user-id", email: "admin@example.com", role: "ADMIN", status: "ACTIVE", createdAt });
  });
});
