import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  normalizeTrustedClientAddress,
  PublicPaymentLinkRateLimiter,
  publicPaymentLinkRateLimitSurface,
} from "./public-rate-limit";

describe("PublicPaymentLinkRateLimiter", () => {
  it("enforces each surface's burst and refills with a monotonic clock", () => {
    let now = 0;
    const limiter = new PublicPaymentLinkRateLimiter({ now: () => now });

    for (let count = 0; count < 12; count += 1) {
      expect(limiter.allow(publicPaymentLinkRateLimitSurface.checkout, "203.0.113.10")).toBe(true);
    }
    expect(limiter.allow(publicPaymentLinkRateLimitSurface.checkout, "203.0.113.10")).toBe(false);

    now = 5_000;
    expect(limiter.allow(publicPaymentLinkRateLimitSurface.checkout, "203.0.113.10")).toBe(true);
  });

  it("keeps budgets separate by closed surface", () => {
    const limiter = new PublicPaymentLinkRateLimiter({ now: () => 0 });
    for (let count = 0; count < 12; count += 1) {
      expect(limiter.allow(publicPaymentLinkRateLimitSurface.checkout, "203.0.113.10")).toBe(true);
    }
    expect(limiter.allow(publicPaymentLinkRateLimitSurface.checkout, "203.0.113.10")).toBe(false);
    expect(limiter.allow(publicPaymentLinkRateLimitSurface.read, "203.0.113.10")).toBe(true);
  });

  it("uses canonical trusted literals and sends invalid forwarding to one anonymous bucket", () => {
    const limiter = new PublicPaymentLinkRateLimiter({ now: () => 0 });

    expect(normalizeTrustedClientAddress("203.0.113.10")).toBe("203.0.113.10");
    expect(normalizeTrustedClientAddress("2001:db8::1")).toBe("2001:db8::1");
    for (const invalid of ["203.0.113.10, 198.51.100.1", "203.0.113.010", " 203.0.113.10", "2001:0db8::1", null]) {
      expect(normalizeTrustedClientAddress(invalid)).toBeNull();
    }

    for (let count = 0; count < 12; count += 1) {
      expect(limiter.allow(publicPaymentLinkRateLimitSurface.checkout, "203.0.113.10, 198.51.100.1")).toBe(true);
    }
    expect(limiter.allow(publicPaymentLinkRateLimitSurface.checkout, "not-an-address")).toBe(false);
  });

  it("holds only a hashed trusted address in its internal key", () => {
    const limiter = new PublicPaymentLinkRateLimiter({ now: () => 0 });
    const address = "203.0.113.10";
    limiter.allow(publicPaymentLinkRateLimitSurface.read, address);

    const entries = (limiter as unknown as { entries: Map<string, unknown> }).entries;
    expect([...entries.keys()]).toEqual([
      `${publicPaymentLinkRateLimitSurface.read}:${createHash("sha256").update(address).digest("hex")}`,
    ]);
  });

  it("lazily removes idle entries and denies unseen keys while a fresh map is full", () => {
    let now = 0;
    const limiter = new PublicPaymentLinkRateLimiter({ now: () => now, maxEntries: 1 });
    expect(limiter.allow(publicPaymentLinkRateLimitSurface.read, "203.0.113.10")).toBe(true);
    expect(limiter.allow(publicPaymentLinkRateLimitSurface.read, "203.0.113.11")).toBe(false);

    now = 10 * 60_000;
    expect(limiter.allow(publicPaymentLinkRateLimitSurface.read, "203.0.113.11")).toBe(true);
  });

  it("debits a same-tick decision synchronously", () => {
    const limiter = new PublicPaymentLinkRateLimiter({ now: () => 0 });
    for (let count = 0; count < 12; count += 1) {
      expect(limiter.allow(publicPaymentLinkRateLimitSurface.checkout, "203.0.113.10")).toBe(true);
    }
    expect(limiter.allow(publicPaymentLinkRateLimitSurface.checkout, "203.0.113.10")).toBe(false);
  });
});
