import { describe, expect, it } from "vitest";

vi.mock("server-only", () => ({}));

import { vi } from "vitest";

import { isExactDecimal, isExactPositiveDecimal, isUuid } from "./decimal";

describe("isExactPositiveDecimal", () => {
  it.each(["500.00", "20.00", "5.205", "196.0784", "1000.0000", "0.5", "1", "0.0001"])(
    "accepts positive plain-decimal string %s and preserves it byte-for-byte",
    (value) => {
      expect(isExactPositiveDecimal(value)).toBe(true);
    },
  );

  it.each([
    ["signed negative", "-1.00"],
    ["signed positive", "+1.00"],
    ["exponent", "1e3"],
    ["small exponent", "1.5e-2"],
    ["leading whitespace", " 1.00"],
    ["trailing whitespace", "1.00 "],
    ["inner whitespace", "1 .00"],
    ["zero", "0"],
    ["padded zero", "0.0"],
    ["zero with many decimals", "0.0000"],
    ["negative zero", "-0.00"],
    ["missing integer part", ".5"],
    ["missing fraction", "5."],
    ["thousands separator", "1,000.00"],
    ["empty", ""],
    ["non-numeric", "abc"],
  ])("rejects %s (%s)", (_label, value) => {
    expect(isExactPositiveDecimal(value)).toBe(false);
  });

  it.each([
    ["number", 500],
    ["float", 0.5],
    ["null", null],
    ["undefined", undefined],
    ["object", { value: "1.00" }],
    ["array", ["1.00"]],
    ["boolean", true],
  ])("rejects non-string value %s", (_label, value) => {
    expect(isExactPositiveDecimal(value)).toBe(false);
  });
});

describe("isExactDecimal", () => {
  it.each(["0", "0.0000", "500.00", "5.205", "196.0784"])("accepts non-negative plain-decimal %s", (value) => {
    expect(isExactDecimal(value)).toBe(true);
  });

  it.each(["-1.00", "+1", "1e3", " 1", "1 ", ".5", "5.", "", "abc", "1,000"])(
    "rejects malformed decimal %s",
    (value) => {
      expect(isExactDecimal(value)).toBe(false);
    },
  );

  it.each([0, 1.5, null, undefined, {}, [], false])("rejects non-string value %s", (value) => {
    expect(isExactDecimal(value)).toBe(false);
  });
});

describe("isUuid", () => {
  it.each([
    "550e8400-e29b-41d4-a716-446655440000",
    "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "A1B2C3D4-E5F6-4890-ABCD-EF1234567890",
  ])("accepts UUID %s", (value) => {
    expect(isUuid(value)).toBe(true);
  });

  it.each([
    "550e8400-e29b-41d4-a716-44665544000",
    "550e8400-e29b-41d4-a716-4466554400000",
    "550e8400e29b41d4a716446655440000",
    "g50e8400-e29b-41d4-a716-446655440000",
    "550e8400-e29b-41d4-a716-446655440000 ",
    "",
    "not-a-uuid",
  ])("rejects malformed UUID %s", (value) => {
    expect(isUuid(value)).toBe(false);
  });

  it.each([null, undefined, 123, {}, []])("rejects non-string value %s", (value) => {
    expect(isUuid(value)).toBe(false);
  });
});
