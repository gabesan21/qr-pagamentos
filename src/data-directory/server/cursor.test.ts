import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createDirectoryCursorCodec, MAX_CURSOR_DECODED_BYTES } from "./cursor";

const keyA = Buffer.alloc(32, 1);
const keyB = Buffer.alloc(32, 2);
const codec = createDirectoryCursorCodec(() => keyA);
const context = {
  directory: "specimen",
  scopePurpose: "MERCHANT_OWN" as const,
  principalId: "merchant-a",
  size: 25 as const,
  canonicalFilterQuery: "q=PIX",
  orderId: "created-id",
};

describe("authenticated directory cursor", () => {
  it("round trips with a canonical non-identifying envelope", () => {
    const token = codec.encode(context, "forward", ["2026-07-24T00:00:00.000Z", "row-2"]);
    expect(token).not.toContain("merchant-a");
    expect(codec.decode(token, context, (tuple) => tuple.length === 2)).toMatchObject({
      status: "valid",
      cursor: {
        version: 1,
        directory: "specimen",
        scopePurpose: "MERCHANT_OWN",
        direction: "forward",
        size: 25,
        orderId: "created-id",
      },
    });
    const [payload, tag] = token.split(".").map((segment) => Buffer.from(segment, "base64url"));
    expect(payload.length + tag.length).toBeLessThanOrEqual(MAX_CURSOR_DECODED_BYTES);
  });

  it("rejects cross-role, cross-owner, wrong-key, tuple, payload, and tag replay identically", () => {
    const token = codec.encode(context, "forward", [10, "row-2"]);
    const invalidContexts = [
      { ...context, principalId: "merchant-b" },
      { ...context, scopePurpose: "ADMIN_GLOBAL" as const, principalId: "admin" },
      { ...context, directory: "other" },
      { ...context, orderId: "other-order" },
    ];
    for (const candidate of invalidContexts) {
      expect(codec.decode(token, candidate, () => true)).toEqual({ status: "invalid" });
    }
    expect(createDirectoryCursorCodec(() => keyB).decode(token, context, () => true)).toEqual({ status: "invalid" });
    expect(codec.decode(token, context, () => false)).toEqual({ status: "invalid" });
    const [payload, tag] = token.split(".");
    const tamperedPayload = `${payload.slice(0, -1)}${payload.endsWith("A") ? "B" : "A"}.${tag}`;
    const tamperedTag = `${payload}.${tag.slice(0, -1)}${tag.endsWith("A") ? "B" : "A"}`;
    expect(codec.decode(tamperedPayload, context, () => true)).toEqual({ status: "invalid" });
    expect(codec.decode(tamperedTag, context, () => true)).toEqual({ status: "invalid" });
  });

  it("classifies only authenticated filter or size changes as stale", () => {
    const token = codec.encode(context, "backward", [10, "row-2"]);
    expect(codec.decode(token, { ...context, size: 50 }, () => true)).toEqual({ status: "stale" });
    expect(codec.decode(token, { ...context, canonicalFilterQuery: "q=Other" }, () => true)).toEqual({ status: "stale" });
  });

  it("rejects over-bound and non-canonical base64url input", () => {
    const huge = `${Buffer.alloc(513).toString("base64url")}.${Buffer.alloc(32).toString("base64url")}`;
    expect(codec.decode(huge, context, () => true)).toEqual({ status: "invalid" });
    expect(codec.decode("abc=.def", context, () => true)).toEqual({ status: "invalid" });
  });
});
