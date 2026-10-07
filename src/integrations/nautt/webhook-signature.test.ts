import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseWebhookSignature, verifyWebhookSignature } from "./webhook-signature";

const body = Buffer.from('{"id":"550e8400-e29b-41d4-a716-446655440000", "event":"order.paid"}\n');

function signature(secret: string, input = body) {
  return `sha256=${createHmac("sha256", secret).update(input).digest("hex")}`;
}

describe("Nautt single-secret webhook signature helper", () => {
  it("verifies exact raw bytes and rejects whitespace mutation", () => {
    expect(verifyWebhookSignature(body, signature("fixture-secret"), Buffer.from("fixture-secret"))).toBe(true);
    expect(verifyWebhookSignature(Buffer.from(body.toString().trim()), signature("fixture-secret"), Buffer.from("fixture-secret"))).toBe(false);
  });

  it.each([null, "", "sha256=AA", `sha256=${"A".repeat(64)}`, `sha256=${"a".repeat(63)}`, `sha256=${"a".repeat(64)},sha256=${"b".repeat(64)}`])(
    "rejects malformed grammar without comparison and clears the secret: %s",
    (value) => {
      const compare = vi.fn(() => false);
      const secret = Buffer.from("fixture-secret");
      expect(parseWebhookSignature(value)).toBeNull();
      expect(verifyWebhookSignature(body, value, secret, { compare })).toBe(false);
      expect(compare).not.toHaveBeenCalled();
      expect(secret).toEqual(Buffer.alloc("fixture-secret".length));
    },
  );

  it.each(["fixture-secret", "wrong-secret"])("compares once and wipes the secret for %s", (value) => {
    const compare = vi.fn((actual: Buffer, expected: Buffer) => actual.equals(expected));
    const secret = Buffer.from(value);
    expect(verifyWebhookSignature(body, signature("fixture-secret"), secret, { compare })).toBe(value === "fixture-secret");
    expect(compare).toHaveBeenCalledOnce();
    expect(compare).toHaveBeenCalledWith(expect.any(Buffer), expect.any(Buffer));
    expect(secret).toEqual(Buffer.alloc(value.length));
  });

  it("wipes the secret even when comparison throws", () => {
    const secret = Buffer.from("fixture-secret");
    expect(() => verifyWebhookSignature(body, signature("fixture-secret"), secret, {
      compare: () => { throw new Error("comparison failed"); },
    })).toThrow("comparison failed");
    expect(secret).toEqual(Buffer.alloc("fixture-secret".length));
  });
});
