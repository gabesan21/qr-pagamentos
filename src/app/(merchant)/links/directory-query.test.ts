import { describe, expect, it, vi } from "vitest";

import type { DirectoryCursorCodec } from "@/data-directory/server/cursor";

vi.mock("server-only", () => ({}));

import { DIRECTORY_INVALID_FILTERS_PARAM, DIRECTORY_INVALID_FILTERS_VALUE, directoryInvalidFiltersLocation } from "@/data-directory/server/notice";

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

  it("extracts each closed notice outcome before canonicalization", () => {
    for (const notice of ["created", "edited", "activated", "deactivated", "failed"] as const) {
      expect(resolve({ "payment-links-v2": notice })).toMatchObject({ status: "ready", notice });
    }
  });

  it("rejects forged, repeated, or empty notice values with zero I/O", () => {
    expect(resolve({ "payment-links-v2": "deleted" }).status).toBe("invalid-query");
    expect(resolve({ "payment-links-v2": ["created", "edited"] }).status).toBe("invalid-query");
    expect(resolve({ "payment-links-v2": "" }).status).toBe("invalid-query");
  });

  it("keeps the notice out of canonical URLs and drops it on a reset", () => {
    const ready = resolve({ "payment-links-v2": "created", "filter.kind": "FIXED_AMOUNT" });
    expect(ready).toMatchObject({ status: "ready", notice: "created" });
    if (ready.status !== "ready") throw new Error("expected ready");
    expect(ready.query.canonicalQuery).toBe("filter.kind=FIXED_AMOUNT");
    expect(resolve({ "payment-links-v2": "created", pageSize: "25" })).toEqual({ status: "redirect", location: "/links" });
  });
});

describe("links directory query reserved invalid-filters pair", () => {
  it("strips the reserved pair before canonicalization and resolves the canonical result for the remaining params", () => {
    const withPair = resolve({ [DIRECTORY_INVALID_FILTERS_PARAM]: DIRECTORY_INVALID_FILTERS_VALUE, "filter.state": "active" });
    const withoutPair = resolve({ "filter.state": "active" });
    expect(withPair).toEqual(withoutPair);
    expect(withPair).toMatchObject({ status: "ready", query: { filters: { state: ["active"] } } });
  });

  it("never redirects back to a URL carrying the reserved pair", () => {
    const bare = resolve({ [DIRECTORY_INVALID_FILTERS_PARAM]: DIRECTORY_INVALID_FILTERS_VALUE });
    expect(bare.status).toBe("ready");
    const forcedRedirect = resolve({ [DIRECTORY_INVALID_FILTERS_PARAM]: DIRECTORY_INVALID_FILTERS_VALUE, q: "  donation  " });
    expect(forcedRedirect).toEqual({ status: "redirect", location: "/links?q=donation" });
    if (forcedRedirect.status === "redirect") expect(forcedRedirect.location).not.toContain(DIRECTORY_INVALID_FILTERS_PARAM);
  });

  it("redirects an otherwise-invalid request to directoryInvalidFiltersLocation(path) exactly once, and resolving that redirect location never loops", () => {
    expect(resolve({ unknown: "1" }).status).toBe("invalid-query");
    const location = directoryInvalidFiltersLocation("/links");
    expect(location).toBe("/links?filters=ignored");

    const [, query] = location.split("?");
    const searchParams = Object.fromEntries(new URLSearchParams(query));
    const resolved = resolve(searchParams);
    expect(resolved).toMatchObject({ status: "ready", query: { filters: {}, pageSize: 25, canonicalQuery: "", canonicalFilterQuery: "" } });
  });
});
