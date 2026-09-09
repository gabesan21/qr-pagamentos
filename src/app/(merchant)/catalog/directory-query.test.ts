import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DIRECTORY_INVALID_FILTERS_PARAM, DIRECTORY_INVALID_FILTERS_VALUE, directoryInvalidFiltersLocation } from "@/data-directory/server/notice";

import { resolveCatalogDirectoryQuery } from "./directory-query";

const definitions = [
  { name: "state", kind: "enum", values: ["active", "inactive", "archived"] },
  { name: "category", kind: "enum", values: ["cat-1", "cat-2"] },
] as const;
const noticeValues = ["create", "update", "conflict", "failed"] as const;

function resolve(searchParams: Record<string, string | string[] | undefined>) {
  return resolveCatalogDirectoryQuery({
    path: "/catalog",
    searchParams,
    definitions,
    noticeKey: "products",
    noticeValues,
  });
}

describe("catalog directory query", () => {
  it("accepts an empty request as ready with defaults", () => {
    expect(resolve({})).toEqual({ status: "ready", filters: {}, pageSize: 25, canonicalFilterQuery: "" });
  });

  it("accepts a lone canonical notice without touching directory state", () => {
    expect(resolve({ products: "update" })).toEqual({ status: "ready", filters: {}, pageSize: 25, canonicalFilterQuery: "", notice: "update" });
  });

  it("rejects unknown or duplicated notices with zero I/O", () => {
    expect(resolve({ products: "bogus" }).status).toBe("invalid-query");
    expect(resolve({ products: ["create", "update"] }).status).toBe("invalid-query");
  });

  it("rejects unknown keys, malformed enums, and cursors", () => {
    expect(resolve({ unknown: "1" }).status).toBe("invalid-query");
    expect(resolve({ "filter.state": "bogus" }).status).toBe("invalid-query");
    expect(resolve({ cursor: "anything" }).status).toBe("invalid-query");
  });

  it("parses search, filters, and page size from canonical input", () => {
    const result = resolve({ q: "coffee", "filter.state": "active", "filter.category": ["cat-1", "cat-2"], pageSize: "50" });
    expect(result).toEqual({
      status: "ready",
      q: "coffee",
      filters: { state: ["active"], category: ["cat-1", "cat-2"] },
      pageSize: 50,
      canonicalFilterQuery: "q=coffee&filter.state=active&filter.category=cat-1&filter.category=cat-2",
    });
  });

  it("resets non-canonical input to the deterministic canonical location", () => {
    expect(resolve({ pageSize: "25" })).toEqual({ status: "redirect", location: "/catalog" });
    expect(resolve({ q: "  coffee  " })).toEqual({ status: "redirect", location: "/catalog?q=coffee" });
    const reordered = resolve({ "filter.category": ["cat-2", "cat-1"] });
    expect(reordered).toEqual({
      status: "redirect",
      location: `/catalog?${new URLSearchParams({ "filter.category": "cat-1" }).toString()}&${new URLSearchParams({ "filter.category": "cat-2" }).toString()}`,
    });
  });
});

describe("catalog directory query reserved invalid-filters pair", () => {
  it("strips the reserved pair before canonicalization and resolves the canonical result for the remaining params", () => {
    const withPair = resolve({ [DIRECTORY_INVALID_FILTERS_PARAM]: DIRECTORY_INVALID_FILTERS_VALUE, "filter.state": "active" });
    const withoutPair = resolve({ "filter.state": "active" });
    expect(withPair).toEqual(withoutPair);
    expect(withPair).toEqual({ status: "ready", filters: { state: ["active"] }, pageSize: 25, canonicalFilterQuery: "filter.state=active" });
  });

  it("never redirects back to a URL carrying the reserved pair", () => {
    const bare = resolve({ [DIRECTORY_INVALID_FILTERS_PARAM]: DIRECTORY_INVALID_FILTERS_VALUE });
    expect(bare.status).toBe("ready");
    const forcedRedirect = resolve({ [DIRECTORY_INVALID_FILTERS_PARAM]: DIRECTORY_INVALID_FILTERS_VALUE, q: "  coffee  " });
    expect(forcedRedirect).toEqual({ status: "redirect", location: "/catalog?q=coffee" });
    if (forcedRedirect.status === "redirect") expect(forcedRedirect.location).not.toContain(DIRECTORY_INVALID_FILTERS_PARAM);
  });

  it("redirects an otherwise-invalid request to directoryInvalidFiltersLocation(path) exactly once, and resolving that redirect location never loops", () => {
    expect(resolve({ unknown: "1" }).status).toBe("invalid-query");
    const location = directoryInvalidFiltersLocation("/catalog");
    expect(location).toBe("/catalog?filters=ignored");

    const [, query] = location.split("?");
    const searchParams = Object.fromEntries(new URLSearchParams(query));
    const resolved = resolve(searchParams);
    expect(resolved).toEqual({ status: "ready", filters: {}, pageSize: 25, canonicalFilterQuery: "" });
  });
});
