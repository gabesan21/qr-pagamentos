import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DIRECTORY_INVALID_FILTERS_PARAM, DIRECTORY_INVALID_FILTERS_VALUE, directoryInvalidFiltersLocation } from "@/data-directory/server/notice";

import { adminAccountsCanonicalTarget, resolveAdminAccountsDirectoryQuery } from "./directory-query";

const principal = { id: "440e8400-e29b-41d4-a716-446655440001", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };

function resolve(searchParams: Record<string, string | readonly string[] | undefined>) {
  return resolveAdminAccountsDirectoryQuery({ searchParams, principal });
}

describe("resolveAdminAccountsDirectoryQuery", () => {
  it("resolves the bare path as ready with the registered default size of 50", () => {
    const result = resolve({});
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.query.pageSize).toBe(50);
    expect(adminAccountsCanonicalTarget(result)).toBe("/admin/accounts");
  });

  it("rejects unknown keys, forged notices, repeated notices, and empty arrays as zero-I/O invalid", () => {
    expect(resolve({ forged: "1" }).status).toBe("invalid-query");
    expect(resolve({ success: "deleted" }).status).toBe("invalid-query");
    expect(resolve({ success: "forged" }).status).toBe("invalid-query");
    expect(resolve({ error: "forged" }).status).toBe("invalid-query");
    expect(resolve({ success: ["created", "changed"] }).status).toBe("invalid-query");
    expect(resolve({ success: "created", error: "create-failed" }).status).toBe("invalid-query");
    expect(resolve({ q: [] }).status).toBe("invalid-query");
  });

  it("strips the delivered notice keys before canonicalization", () => {
    const created = resolve({ success: "created" });
    expect(created.status).toBe("ready");
    if (created.status !== "ready") return;
    expect(created.notice).toEqual({ tone: "success", value: "created" });
    expect(adminAccountsCanonicalTarget(created)).toBe("/admin/accounts");

    const failed = resolve({ error: "change-failed", "filter.state": "DELETED" });
    expect(failed.status).toBe("ready");
    if (failed.status !== "ready") return;
    expect(failed.notice).toEqual({ tone: "error", value: "change-failed" });
    expect(adminAccountsCanonicalTarget(failed)).toBe("/admin/accounts?filter.state=DELETED");
  });

  it("redirects non-canonical queries to the canonical reset and drops the notice", () => {
    expect(resolve({ pageSize: "50" })).toEqual({ status: "redirect", location: "/admin/accounts" });
    expect(resolve({ success: "created", pageSize: "50" })).toEqual({ status: "redirect", location: "/admin/accounts" });
    expect(resolve({ "filter.role": "ADMIN", q: "ana" })).toEqual({
      status: "redirect",
      location: "/admin/accounts?q=ana&filter.role=ADMIN",
    });
  });

  it("keeps registered non-default page sizes canonical", () => {
    const result = resolve({ pageSize: "10" });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.query.pageSize).toBe(10);
    expect(adminAccountsCanonicalTarget(result)).toBe("/admin/accounts?pageSize=10");
  });
});

describe("resolveAdminAccountsDirectoryQuery reserved invalid-filters pair", () => {
  it("strips the reserved pair before canonicalization and resolves the canonical result for the remaining params", () => {
    const withPair = resolve({ [DIRECTORY_INVALID_FILTERS_PARAM]: DIRECTORY_INVALID_FILTERS_VALUE, "filter.state": "DELETED" });
    const withoutPair = resolve({ "filter.state": "DELETED" });
    expect(withPair).toEqual(withoutPair);
    expect(withPair.status).toBe("ready");
    if (withPair.status !== "ready") return;
    expect(adminAccountsCanonicalTarget(withPair)).toBe("/admin/accounts?filter.state=DELETED");
  });

  it("never redirects back to a URL carrying the reserved pair", () => {
    const bare = resolve({ [DIRECTORY_INVALID_FILTERS_PARAM]: DIRECTORY_INVALID_FILTERS_VALUE });
    expect(bare.status).toBe("ready");
    const redirect = resolve({ [DIRECTORY_INVALID_FILTERS_PARAM]: DIRECTORY_INVALID_FILTERS_VALUE, pageSize: "50" });
    expect(redirect).toEqual({ status: "redirect", location: "/admin/accounts" });
    if (redirect.status === "redirect") expect(redirect.location).not.toContain(DIRECTORY_INVALID_FILTERS_PARAM);
  });

  it("redirects an otherwise-invalid request to directoryInvalidFiltersLocation(path) exactly once, and resolving that redirect location never loops", () => {
    expect(resolve({ forged: "1" }).status).toBe("invalid-query");
    const buildLocation = vi.fn(directoryInvalidFiltersLocation);
    const location = buildLocation("/admin/accounts");
    expect(buildLocation).toHaveBeenCalledTimes(1);
    expect(location).toBe("/admin/accounts?filters=ignored");

    const [, query] = location.split("?");
    const searchParams = Object.fromEntries(new URLSearchParams(query));
    const resolved = resolve(searchParams);
    expect(resolved.status).toBe("ready");
    if (resolved.status !== "ready") return;
    expect(adminAccountsCanonicalTarget(resolved)).toBe("/admin/accounts");
  });
});
