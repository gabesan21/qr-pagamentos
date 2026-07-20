import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseWebhookSignature, verifyWebhookOwner } from "./webhook-signature";

const body = Buffer.from('{"id":"550e8400-e29b-41d4-a716-446655440000", "event":"order.paid"}\n');

function signature(secret: string, input = body) {
  return `sha256=${createHmac("sha256", secret).update(input).digest("hex")}`;
}

describe("Nautt webhook signature", () => {
  it("verifies the exact raw bytes and rejects whitespace mutation", () => {
    expect(verifyWebhookOwner(body, signature("fixture-secret"), [{ ownerId: "owner-a", secret: Buffer.from("fixture-secret") }])).toBe("owner-a");
    expect(verifyWebhookOwner(Buffer.from(body.toString().trim()), signature("fixture-secret"), [{ ownerId: "owner-a", secret: Buffer.from("fixture-secret") }])).toBeNull();
  });

  it.each([null, "", "sha256=AA", `sha256=${"A".repeat(64)}`, `sha256=${"a".repeat(63)}`, `sha256=${"a".repeat(64)},sha256=${"b".repeat(64)}`])(
    "rejects malformed grammar without comparison and clears candidate secrets: %s",
    (value) => {
      const compare = vi.fn(() => false);
      const candidates = [
        { ownerId: "owner-a", secret: Buffer.from("secret-a") },
        { ownerId: "owner-b", secret: Buffer.from("secret-b") },
      ];

      expect(parseWebhookSignature(value)).toBeNull();
      expect(verifyWebhookOwner(body, value, candidates, { compare })).toBeNull();
      expect(compare).not.toHaveBeenCalled();
      expect(candidates[0].secret).toEqual(Buffer.alloc("secret-a".length));
      expect(candidates[1].secret).toEqual(Buffer.alloc("secret-b".length));
    },
  );

  it("compares every fixed-length candidate without early exit and rejects ambiguity", () => {
    const compare = vi.fn((actual: Buffer, expected: Buffer) => actual.equals(expected));
    const candidates = [
      { ownerId: "owner-a", secret: Buffer.from("wrong-a") },
      { ownerId: "owner-b", secret: Buffer.from("right") },
      { ownerId: "owner-c", secret: Buffer.from("wrong-c") },
    ];
    expect(verifyWebhookOwner(body, signature("right"), candidates, { compare })).toBe("owner-b");
    expect(compare).toHaveBeenCalledTimes(3);
    const ambiguous = [
      { ownerId: "owner-a", secret: Buffer.from("wrong-a") },
      { ownerId: "owner-b", secret: Buffer.from("right") },
      { ownerId: "owner-c", secret: Buffer.from("wrong-c") },
      { ownerId: "owner-d", secret: Buffer.from("right") },
    ];
    expect(verifyWebhookOwner(body, signature("right"), ambiguous)).toBeNull();
  });
});
