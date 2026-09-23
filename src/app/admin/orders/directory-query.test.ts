import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DIRECTORY_INVALID_FILTERS_PARAM, DIRECTORY_INVALID_FILTERS_VALUE, directoryInvalidFiltersLocation } from "@/data-directory/server/notice";

import { adminOrdersCanonicalTarget, resolveAdminOrdersDirectoryQuery } from "./directory-query";

const principal = { id: "440e8400-e29b-41d4-a716-446655440001", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };

function resolve(searchParams: Record<string, string | readonly string[] | undefined>) {
  return resolveAdminOrdersDirectoryQuery({ searchParams, principal });
}

describe("resolveAdminOrdersDirectoryQuery", () => {
  it("resolves the bare path as ready with the registered default size of 50", () => {
    const result = resolve({});
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.query.pageSize).toBe(50);
    expect(adminOrdersCanonicalTarget(result)).toBe("/admin/orders");
  });

  it("rejects unknown keys, notice keys, and empty arrays as zero-I/O invalid", () => {
    expect(resolve({ forged: "1" }).status).toBe("invalid-query");
    expect(resolve({ "orders-v2": "commented" }).status).toBe("invalid-query");
    expect(resolve({ q: [] }).status).toBe("invalid-query");
  });

  it("redirects non-canonical queries to the canonical reset", () => {
    expect(resolve({ pageSize: "50" })).toEqual({ status: "redirect", location: "/admin/orders" });
    expect(resolve({ "filter.source": "LINK", q: "ana" })).toEqual({
      status: "redirect",
      location: "/admin/orders?q=ana&filter.source=LINK",
    });
  });

  it("keeps registered non-default page sizes canonical", () => {
    const result = resolve({ pageSize: "10" });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.query.pageSize).toBe(10);
    expect(adminOrdersCanonicalTarget(result)).toBe("/admin/orders?pageSize=10");
  });

  it("rejects page sizes outside the registered subset", () => {
    expect(resolve({ pageSize: "25" }).status).toBe("invalid-query");
    expect(resolve({ pageSize: "30" }).status).toBe("invalid-query");
  });
});

describe("resolveAdminOrdersDirectoryQuery reserved invalid-filters pair", () => {
  it("strips the reserved pair before canonicalization and resolves the canonical result for the remaining params", () => {
    const withPair = resolve({ [DIRECTORY_INVALID_FILTERS_PARAM]: DIRECTORY_INVALID_FILTERS_VALUE, "filter.source": "LINK" });
    const withoutPair = resolve({ "filter.source": "LINK" });
    expect(withPair).toEqual(withoutPair);
    expect(withPair.status).toBe("ready");
    if (withPair.status !== "ready") return;
    expect(adminOrdersCanonicalTarget(withPair)).toBe("/admin/orders?filter.source=LINK");
  });

  it("never redirects back to a URL carrying the reserved pair", () => {
    const bare = resolve({ [DIRECTORY_INVALID_FILTERS_PARAM]: DIRECTORY_INVALID_FILTERS_VALUE });
    expect(bare.status).toBe("ready");
    const redirect = resolve({ [DIRECTORY_INVALID_FILTERS_PARAM]: DIRECTORY_INVALID_FILTERS_VALUE, pageSize: "50" });
    expect(redirect).toEqual({ status: "redirect", location: "/admin/orders" });
    if (redirect.status === "redirect") expect(redirect.location).not.toContain(DIRECTORY_INVALID_FILTERS_PARAM);
  });

  it("redirects an otherwise-invalid request to directoryInvalidFiltersLocation(path) exactly once, and resolving that redirect location never loops", () => {
    expect(resolve({ forged: "1" }).status).toBe("invalid-query");
    const buildLocation = vi.fn(directoryInvalidFiltersLocation);
    const location = buildLocation("/admin/orders");
    expect(buildLocation).toHaveBeenCalledTimes(1);
    expect(location).toBe("/admin/orders?filters=ignored");

    const [, query] = location.split("?");
    const searchParams = Object.fromEntries(new URLSearchParams(query));
    const resolved = resolve(searchParams);
    expect(resolved.status).toBe("ready");
    if (resolved.status !== "ready") return;
    expect(adminOrdersCanonicalTarget(resolved)).toBe("/admin/orders");
  });
});
