import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseWebhookSignature, verifyWebhookSignature } from "./webhook-signature";

const body = Buffer.from('{"id":"550e8400-e29b-41d4-a716-446655440000", "event":"order.paid"}\n');

function signature(secret: string, input = body) {
  return `sha256=${createHmac("sha256", secret).update(input).digest("hex")}`;
}

describe("Nautt single-secret webhook signature helper", () => {
  const productionSecret = "nautt_whsec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
  const productionBody = Buffer.from('{"data":{"uuid":"550e8400-e29b-41d4-a716-446655440012"},"label":"ação"}\n', "utf8");
  const productionSignature = "sha256=d1d9b94d9a3b058e7a1ad2480fa206297aad887f6fb27aa71b39a6211ddb0567";

  it("matches the independent production vector using the complete UTF-8 secret", () => {
    expect(verifyWebhookSignature(productionBody, productionSignature, Buffer.from(productionSecret))).toBe(true);
    const suffix = productionSecret.slice("nautt_whsec_".length);
    expect(verifyWebhookSignature(productionBody, productionSignature, Buffer.from(suffix))).toBe(false);
    expect(verifyWebhookSignature(productionBody, productionSignature, Buffer.from(suffix, "base64url"))).toBe(false);
  });

  it.each([
    '{"data":{"uuid":"550e8400-e29b-41d4-a716-446655440012"},"label":"ação"}',
    '{"data": {"uuid":"550e8400-e29b-41d4-a716-446655440012"},"label":"ação"}\n',
    '{"label":"ação","data":{"uuid":"550e8400-e29b-41d4-a716-446655440012"}}\n',
    '{"data":{"uuid":"550e8400-e29b-41d4-a716-446655440012"},"label":"a\\u00e7\\u00e3o"}\n',
    '{"data":{"uuid":"550e8400-e29b-41d4-a716-446655440012"},"label":"outra"}\n',
  ])("rejects byte changes, including fields outside routing: %s", (mutated) => {
    expect(verifyWebhookSignature(Buffer.from(mutated), productionSignature, Buffer.from(productionSecret))).toBe(false);
  });

  it("authenticates absent and historical event timestamps without a freshness gate", () => {
    for (const input of [productionBody, Buffer.from('{"created_at":"2000-01-01T00:00:00Z","data":{"uuid":"550e8400-e29b-41d4-a716-446655440012"}}')]) {
      expect(verifyWebhookSignature(input, signature(productionSecret, input), Buffer.from(productionSecret))).toBe(true);
    }
  });

  it("verifies exact raw bytes and rejects whitespace mutation", () => {
    expect(verifyWebhookSignature(body, signature("fixture-secret"), Buffer.from("fixture-secret"))).toBe(true);
    expect(verifyWebhookSignature(Buffer.from(body.toString().trim()), signature("fixture-secret"), Buffer.from("fixture-secret"))).toBe(false);
  });

  it.each([null, "", "sha256=AA", `sha256=${"A".repeat(64)}`, `sha256=${"a".repeat(63)}`, `sha256=${"a".repeat(64)},sha256=${"b".repeat(64)}`, "a".repeat(64), `sha256=${"a".repeat(64)}\n`])(
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
