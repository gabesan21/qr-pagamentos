import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { instantToLocalInput, localInputToUtc } from "./link-expiry";

// A non-zero UTC offset proves the conversion is real, not a string slice of
// the stored instant. Node honors a runtime TZ change, and vitest isolates
// this file in its own process.
const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Sao_Paulo";
});
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("link expiry local/UTC conversion", () => {
  it("converts a browser-local datetime to the UTC server grammar", () => {
    expect(localInputToUtc("2027-08-01T12:30")).toBe("2027-08-01T15:30");
    expect(localInputToUtc("")).toBe("");
  });

  it("renders a stored instant in the browser local clock", () => {
    expect(instantToLocalInput("2027-08-01T15:30:00.000Z")).toBe("2027-08-01T12:30");
    expect(instantToLocalInput("")).toBe("");
  });

  it("round-trips a local value through the stored instant", () => {
    const local = "2027-12-31T23:59";
    expect(instantToLocalInput(`${localInputToUtc(local)}:00.000Z`)).toBe(local);
  });
});
