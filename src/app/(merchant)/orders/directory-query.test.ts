import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ordersCanonicalTarget, resolveOrdersDirectoryQuery } from "./directory-query";

const principal = { id: "440e8400-e29b-41d4-a716-446655440001", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };

function resolve(searchParams: Record<string, string | readonly string[] | undefined>) {
  return resolveOrdersDirectoryQuery({ searchParams, principal });
}

describe("resolveOrdersDirectoryQuery", () => {
  it("resolves the bare path as ready without a notice", () => {
    const result = resolve({});
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.notice).toBeUndefined();
    expect(result.query.pageSize).toBe(20);
    expect(ordersCanonicalTarget(result)).toBe("/orders");
  });

  it("strips and keeps a valid notice through a canonical ready resolution", () => {
    const result = resolve({ "orders-v2": "outcome-set", q: "ana" });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.notice).toBe("outcome-set");
    expect(result.query.q).toBe("ana");
    expect(ordersCanonicalTarget(result)).toBe("/orders?q=ana");
  });

  it("resolves every closed notice value", () => {
    for (const notice of ["commented", "comment-edited", "outcome-set", "failed"] as const) {
      const result = resolve({ "orders-v2": notice });
      expect(result.status).toBe("ready");
      if (result.status === "ready") expect(result.notice).toBe(notice);
    }
  });

  it("rejects forged, repeated, or array notice values as zero-I/O invalid", () => {
    expect(resolve({ "orders-v2": "deleted" }).status).toBe("invalid-query");
    expect(resolve({ "orders-v2": ["commented", "failed"] }).status).toBe("invalid-query");
  });

  it("rejects unknown keys and empty arrays as zero-I/O invalid", () => {
    expect(resolve({ forged: "1" }).status).toBe("invalid-query");
    expect(resolve({ q: [] }).status).toBe("invalid-query");
  });

  it("redirects non-canonical queries to the canonical reset", () => {
    const result = resolve({ pageSize: "20" });
    expect(result).toEqual({ status: "redirect", location: "/orders" });
  });

  it("keeps registered non-default page sizes canonical", () => {
    const result = resolve({ pageSize: "100" });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.query.pageSize).toBe(100);
    expect(ordersCanonicalTarget(result)).toBe("/orders?pageSize=100");
  });

  it("rejects page sizes outside the registered subset", () => {
    expect(resolve({ pageSize: "25" }).status).toBe("invalid-query");
  });
});
