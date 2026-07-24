import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Principal } from "@/auth/authorization";

import { canonicalizeDirectoryRequest } from "./canonical-request";
import { createDirectoryCursorCodec } from "./cursor";

const principal: Principal = {
  id: "merchant-a",
  username: "merchant",
  email: null,
  role: "USER",
  status: "ACTIVE",
  createdAt: new Date("2026-07-24T00:00:00Z"),
};
const key = Buffer.alloc(32, 7);
const codec = createDirectoryCursorCodec(() => key);
const base = {
  path: "/directory",
  definitions: [{ name: "status", kind: "enum" as const, values: ["ACTIVE", "DISABLED"] }],
  directory: "specimen",
  scopePurpose: "MERCHANT_OWN" as const,
  principal,
  orderId: "created-id",
  validateTuple: (tuple: readonly unknown[]) => tuple.length === 2,
};

describe("canonical directory request", () => {
  it("redirects one relative hop for native GET defaults and ordering", () => {
    expect(canonicalizeDirectoryRequest({
      ...base,
      requestTarget: "/directory?pageSize=25&q=PIX&filter.status=DISABLED&filter.status=ACTIVE",
    }, codec)).toEqual({
      status: "redirect",
      location: "/directory?q=PIX&filter.status=ACTIVE&filter.status=DISABLED",
    });
    expect(canonicalizeDirectoryRequest({
      ...base,
      requestTarget: "/directory?q=PIX&filter.status=ACTIVE&filter.status=DISABLED",
    }, codec)).toMatchObject({ status: "ready" });
  });

  it("drops an authentic stale cursor but rejects unauthentic input without echo", () => {
    const oldCursor = codec.encode({
      directory: "specimen",
      scopePurpose: "MERCHANT_OWN",
      principalId: "merchant-a",
      size: 25,
      canonicalFilterQuery: "q=Old",
      orderId: "created-id",
    }, "forward", [1, "id"]);
    expect(canonicalizeDirectoryRequest({
      ...base,
      requestTarget: `/directory?q=New&cursor=${oldCursor}`,
    }, codec)).toEqual({ status: "redirect", location: "/directory?q=New" });
    expect(canonicalizeDirectoryRequest({
      ...base,
      requestTarget: "/directory?q=New&cursor=attacker-input",
    }, codec)).toEqual({ status: "invalid-query" });
  });

  it("can be decided before adapter I/O", () => {
    const adapter = vi.fn();
    const result = canonicalizeDirectoryRequest({
      ...base,
      requestTarget: "/directory?unknown=secret",
    }, codec);
    expect(result).toEqual({ status: "invalid-query" });
    expect(adapter).not.toHaveBeenCalled();
    expect(canonicalizeDirectoryRequest({
      ...base,
      path: "//attacker.example",
      requestTarget: "/directory",
    }, codec)).toEqual({ status: "invalid-query" });
  });
});
