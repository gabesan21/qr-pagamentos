import { createHash, createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createPublicPaymentStatusV2Service } from "./payment-status-v2";

const key = Buffer.from("01234567890123456789012345678901");
const expiresAt = new Date("2026-07-27T12:00:00Z");
const attempt = { id: "8c72f22e-4168-49e7-b601-8448c57b4f83", capabilityNonce: "a".repeat(43), capabilityKeyVersion: "v1", capabilityVerifier: "", capabilityExpiresAt: expiresAt, capabilityRevokedAt: null, order: { state: "PENDING" as const, providerOrders: [{ pixCopyPaste: "000201", pixQrcodeUrl: "https://qr.example.test/opaque" }] } };
const bearer = createHmac("sha256", key).update(`checkout-v2-capability:v1:${attempt.id}:${expiresAt.toISOString()}:${attempt.capabilityNonce}`).digest("base64url");
attempt.capabilityVerifier = createHash("sha256").update(bearer).digest("hex");

describe("public payment status V2", () => {
  it("accepts only a live attempt-bound capability and returns the closed payment DTO", async () => {
    const findByCapabilityVerifier = vi.fn().mockResolvedValue(attempt);
    const service = createPublicPaymentStatusV2Service({ findByCapabilityVerifier }, { now: () => new Date("2026-07-26T12:00:00Z"), capabilityKey: () => key });

    await expect(service.read(bearer)).resolves.toEqual({ state: "PENDING", pixCopyPaste: "000201" });
    expect(findByCapabilityVerifier).toHaveBeenCalledWith(createHash("sha256").update(bearer).digest("hex"));
  });

  it.each([
    ["malformed", { ...attempt, capabilityRevokedAt: null }],
    ["missing", null],
    ["expired", { ...attempt, capabilityExpiresAt: new Date("2026-07-25T12:00:00Z") }],
    ["revoked", { ...attempt, capabilityRevokedAt: new Date("2026-07-26T11:00:00Z") }],
    ["mismatch", { ...attempt, capabilityVerifier: "0".repeat(64) }],
  ] as const)("maps %s capability outcomes to one unavailable result", async (kind, result) => {
    const findByCapabilityVerifier = vi.fn().mockResolvedValue(result);
    const service = createPublicPaymentStatusV2Service({ findByCapabilityVerifier }, { now: () => new Date("2026-07-26T12:00:00Z"), capabilityKey: () => key });

    await expect(service.read(kind === "malformed" ? "short" : bearer)).resolves.toBeNull();
  });

  it("never exposes QR data from a terminal payment", async () => {
    const findByCapabilityVerifier = vi.fn().mockResolvedValue({ ...attempt, order: { state: "CONFIRMED" as const, providerOrders: attempt.order.providerOrders } });
    const service = createPublicPaymentStatusV2Service({ findByCapabilityVerifier }, { now: () => new Date("2026-07-26T12:00:00Z"), capabilityKey: () => key });

    await expect(service.read(bearer)).resolves.toEqual({ state: "CONFIRMED" });
  });

  describe("rotation window", () => {
    const previousKey = Buffer.from("98765432109876543210987654321098");
    const previousBearer = createHmac("sha256", previousKey)
      .update(`checkout-v2-capability:v1:${attempt.id}:${expiresAt.toISOString()}:${attempt.capabilityNonce}`)
      .digest("base64url");
    const rotatedAttempt = { ...attempt, capabilityVerifier: createHash("sha256").update(previousBearer).digest("hex") };

    it("verifies a capability minted under the previous key when configured", async () => {
      const findByCapabilityVerifier = vi.fn().mockResolvedValue(rotatedAttempt);
      const service = createPublicPaymentStatusV2Service(
        { findByCapabilityVerifier },
        { now: () => new Date("2026-07-26T12:00:00Z"), capabilityKey: () => key, previousCapabilityKey: () => previousKey },
      );

      await expect(service.read(previousBearer)).resolves.toEqual({ state: "PENDING", pixCopyPaste: "000201" });
    });

    it("fails closed on a previous-key capability when no previous key is configured", async () => {
      const findByCapabilityVerifier = vi.fn().mockResolvedValue(rotatedAttempt);
      const service = createPublicPaymentStatusV2Service(
        { findByCapabilityVerifier },
        { now: () => new Date("2026-07-26T12:00:00Z"), capabilityKey: () => key },
      );

      await expect(service.read(previousBearer)).resolves.toBeNull();
    });

    it("prefers the current key over the previous key when both are configured", async () => {
      const findByCapabilityVerifier = vi.fn().mockResolvedValue(attempt);
      const service = createPublicPaymentStatusV2Service(
        { findByCapabilityVerifier },
        { now: () => new Date("2026-07-26T12:00:00Z"), capabilityKey: () => key, previousCapabilityKey: () => previousKey },
      );

      await expect(service.read(bearer)).resolves.toEqual({ state: "PENDING", pixCopyPaste: "000201" });
    });
  });
});
