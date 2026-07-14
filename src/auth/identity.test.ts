import { describe, expect, it } from "vitest";

import { normalizeOptionalEmail, normalizeUsername, toUserDto, validatePassword } from "./identity";

describe("identity input contracts", () => {
  it.each([
    [" Admin.User ", "admin.user"],
    ["abc", "abc"],
    ["a".repeat(32), "a".repeat(32)],
  ])("canonicalizes username %j", (input, canonical) => {
    expect(normalizeUsername(input)).toBe(canonical);
  });

  it.each([
    "ab", "a".repeat(33), "usuário", "admin user", "admin@example", ".admin", "admin.",
    "admin..user", "admin-_user", "admin\0", "admin\r", "admin\n", "\t\t",
  ])("rejects invalid username without echoing it: %j", (input) => {
    expect(() => normalizeUsername(input)).toThrowError("Invalid username");
    try { normalizeUsername(input); } catch (error) { expect(String(error)).not.toContain(input); }
  });

  it.each([
    [" Admin.Example+ops@Example.COM ", "admin.example+ops@example.com"],
    ["a@b.co", "a@b.co"],
    [`${"a".repeat(64)}@b.co`, `${"a".repeat(64)}@b.co`],
    [`a@${"b".repeat(63)}.co`, `a@${"b".repeat(63)}.co`],
  ])("canonicalizes %s", (input, canonical) => {
    expect(normalizeOptionalEmail(input)).toBe(canonical);
  });

  it.each([
    "admin@example.com\0", "admin@example.com\r", "admin@example.com\n",
    "á@example.com", "a @example.com", "aexample.com", "a@@example.com",
    ".a@example.com", "a.@example.com", "a..b@example.com", "a@example",
    "a@.example.com", "a@example..com", "a@-example.com", "a@example-.com",
    `${"a".repeat(65)}@b.co`, `a@${"b".repeat(64)}.co`, "a@example.c",
    `a@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.${"e".repeat(59)}.com`,
  ])("rejects invalid email without echoing it: %j", (input) => {
    expect(() => normalizeOptionalEmail(input)).toThrowError("Invalid email address");
    try { normalizeOptionalEmail(input); } catch (error) { expect(String(error)).not.toContain(input); }
  });

  it.each([undefined, null, "", "  \t "])("maps absent optional email %j to null", (input) => {
    expect(normalizeOptionalEmail(input)).toBeNull();
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
      id: "user-id", username: "admin", email: null, role: "ADMIN", status: "ACTIVE", createdAt,
      passwordHash: "forbidden", internalAuthorization: "forbidden",
    })).toEqual({ id: "user-id", username: "admin", email: null, role: "ADMIN", status: "ACTIVE", createdAt });
  });
});
