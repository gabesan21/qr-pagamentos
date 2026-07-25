import { describe, expect, it, vi } from "vitest";

import type { DirectoryCursorCodec } from "@/data-directory/server/cursor";

vi.mock("server-only", () => ({}));

import { resolveLinksDirectoryQuery } from "./directory-query";

const principal = { id: "440e8400-e29b-41d4-a716-446655440001", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const tuple = [1_780_000_000_000, principal.id] as const;

// A deterministic codec stub: the real HMAC codec is foundation-covered; here
// only the ready/redirect/invalid mapping matters.
const codec: DirectoryCursorCodec = {
  encode: () => "valid.forward",
  decode: (token, context, validateTuple) => {
    if (token === "stale") return { status: "stale" };
    if (!token.startsWith("valid.")) return { status: "invalid" };
    if (!validateTuple(tuple)) return { status: "invalid" };
    return {
      status: "valid",
      cursor: {
        version: 1,
        directory: context.directory,
        scopePurpose: context.scopePurpose,
        direction: token.slice("valid.".length) as "forward" | "backward",
        size: context.size,
        filterHash: "x".repeat(43),
        orderId: context.orderId,
        tuple,
      },
    };
  },
};

function resolve(searchParams: Record<string, string | string[] | undefined>) {
  return resolveLinksDirectoryQuery({ searchParams, principal }, codec);
}

describe("links directory query", () => {
  it("accepts an empty request as ready with defaults", () => {
    expect(resolve({})).toMatchObject({ status: "ready", query: { filters: {}, pageSize: 25, canonicalQuery: "", canonicalFilterQuery: "" } });
  });

  it("rejects unknown keys, malformed enums, and empty multi-values with zero I/O", () => {
    expect(resolve({ unknown: "1" }).status).toBe("invalid-query");
    expect(resolve({ "filter.state": "bogus" }).status).toBe("invalid-query");
    expect(resolve({ "filter.type": ["SINGLE_USE"] , "filter.kind": [] }).status).toBe("invalid-query");
  });

  it("parses search, filters, and page size from canonical input", () => {
    const result = resolve({ q: "donation", "filter.state": "active", "filter.type": ["REUSABLE", "SINGLE_USE"], pageSize: "50" });
    expect(result).toMatchObject({
      status: "ready",
      query: { q: "donation", filters: { state: ["active"], type: ["REUSABLE", "SINGLE_USE"] }, pageSize: 50 },
    });
  });

  it("resets non-canonical input to the deterministic canonical location", () => {
    expect(resolve({ pageSize: "25" })).toEqual({ status: "redirect", location: "/links" });
    expect(resolve({ q: "  donation  " })).toEqual({ status: "redirect", location: "/links?q=donation" });
  });

  it("rejects an undecodable cursor and drops a stale cursor with a reset", () => {
    expect(resolve({ cursor: "forged" }).status).toBe("invalid-query");
    expect(resolve({ cursor: "stale" })).toEqual({ status: "redirect", location: "/links" });
  });

  it("accepts a valid cursor and exposes its envelope", () => {
    const result = resolve({ cursor: "valid.forward" });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("expected ready");
    expect(result.cursor?.direction).toBe("forward");
    expect(result.cursor?.tuple).toEqual(tuple);
  });
});
