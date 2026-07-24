import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  MAX_RAW_QUERY_BYTES,
  isRawDirectoryQueryWithinLimit,
  parseDirectoryQuery,
} from "./query-contract";

const definitions = [
  { name: "status", kind: "enum", values: ["ACTIVE", "DISABLED"] },
  { name: "reference", kind: "text" },
] as const;

describe("directory raw query contract", () => {
  it("accepts exactly 2048 raw bytes and rejects 2049 before decoding", () => {
    const accepted = "a".repeat(MAX_RAW_QUERY_BYTES);
    const rejected = `${accepted}a`;
    expect(isRawDirectoryQueryWithinLimit(accepted)).toBe(true);
    expect(isRawDirectoryQueryWithinLimit(rejected)).toBe(false);
    expect(parseDirectoryQuery(`/directory?${rejected}`, definitions)).toEqual({ ok: false });
  });

  it("measures encoded bytes rather than decoded characters", () => {
    expect(isRawDirectoryQueryWithinLimit(`q=${"%61".repeat(682)}`)).toBe(true);
    expect(isRawDirectoryQueryWithinLimit(`q=${"%61".repeat(683)}`)).toBe(false);
    expect(isRawDirectoryQueryWithinLimit(`q=${"é".repeat(100)}`)).toBe(true);
    expect(isRawDirectoryQueryWithinLimit(`q=${"é".repeat(1024)}`)).toBe(false);
    expect(parseDirectoryQuery("/directory?q=%C3%A9", definitions).ok).toBe(true);
    expect(parseDirectoryQuery("/directory?q=😀", definitions)).toMatchObject({
      ok: true,
      value: { q: "😀", canonicalQuery: "q=%F0%9F%98%80" },
    });
  });

  it("uses strict percent and fatal UTF-8 decoding", () => {
    for (const query of ["q=%", "q=%2", "q=%GG", "q=%C3%28", "q=%ED%A0%80"]) {
      expect(parseDirectoryQuery(`/directory?${query}`, definitions)).toEqual({ ok: false });
    }
    expect(parseDirectoryQuery("/directory?q=PIX+receipt", definitions)).toMatchObject({
      ok: true,
      value: { q: "PIX receipt", canonicalQuery: "q=PIX+receipt" },
    });
  });

  it("bounds entries, text, enum values, uniqueness, and registered keys", () => {
    expect(parseDirectoryQuery(`/directory?${Array.from({ length: 33 }, () => "q=a").join("&")}`, definitions).ok).toBe(false);
    expect(parseDirectoryQuery("/directory?q=a&q=b", definitions).ok).toBe(false);
    expect(parseDirectoryQuery(`/directory?q=${"a".repeat(101)}`, definitions).ok).toBe(false);
    expect(parseDirectoryQuery("/directory?q=%0A", definitions).ok).toBe(false);
    expect(parseDirectoryQuery("/directory?unknown=value", definitions).ok).toBe(false);
    expect(parseDirectoryQuery("/directory?filter.status=UNKNOWN", definitions).ok).toBe(false);
    expect(parseDirectoryQuery("/directory?filter.status=ACTIVE&filter.status=ACTIVE&filter.status=DISABLED", definitions)).toMatchObject({
      ok: true,
      value: {
        filters: { status: ["ACTIVE", "DISABLED"] },
        canonicalQuery: "filter.status=ACTIVE&filter.status=DISABLED",
      },
    });
  });

  it("omits defaults and empty values while retaining a closed page size", () => {
    expect(parseDirectoryQuery("/directory?q=&filter.reference=++&pageSize=25&cursor=", definitions)).toMatchObject({
      ok: true,
      value: { filters: {}, pageSize: 25, canonicalQuery: "" },
    });
    expect(parseDirectoryQuery("/directory?pageSize=50", definitions)).toMatchObject({
      ok: true,
      value: { pageSize: 50, canonicalQuery: "pageSize=50" },
    });
    expect(parseDirectoryQuery("/directory?pageSize=10", definitions)).toEqual({ ok: false });
  });
});
