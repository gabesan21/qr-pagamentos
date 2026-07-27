import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { adminPaymentLinksCanonicalTarget, resolveAdminPaymentLinksDirectoryQuery } from "./directory-query";

const principal = { id: "440e8400-e29b-41d4-a716-446655440001", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };

function resolve(searchParams: Record<string, string | readonly string[] | undefined>) {
  return resolveAdminPaymentLinksDirectoryQuery({ searchParams, principal });
}

describe("resolveAdminPaymentLinksDirectoryQuery", () => {
  it("resolves the bare path as ready with the registered default size of 50", () => {
    const result = resolve({});
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.query.pageSize).toBe(50);
    expect(adminPaymentLinksCanonicalTarget(result)).toBe("/admin/payment-links");
  });

  it("rejects unknown keys, notice keys, and empty arrays as zero-I/O invalid", () => {
    expect(resolve({ forged: "1" }).status).toBe("invalid-query");
    expect(resolve({ "payment-links-v2": "created" }).status).toBe("invalid-query");
    expect(resolve({ q: [] }).status).toBe("invalid-query");
  });

  it("redirects non-canonical queries to the canonical reset", () => {
    expect(resolve({ pageSize: "50" })).toEqual({ status: "redirect", location: "/admin/payment-links" });
    expect(resolve({ "filter.state": "paid", q: "donation" })).toEqual({
      status: "redirect",
      location: "/admin/payment-links?q=donation&filter.state=paid",
    });
  });

  it("keeps registered non-default page sizes canonical", () => {
    const result = resolve({ pageSize: "10" });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.query.pageSize).toBe(10);
    expect(adminPaymentLinksCanonicalTarget(result)).toBe("/admin/payment-links?pageSize=10");
  });

  it("rejects page sizes outside the registered subset", () => {
    expect(resolve({ pageSize: "25" }).status).toBe("invalid-query");
    expect(resolve({ pageSize: "30" }).status).toBe("invalid-query");
  });
});
