import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ForbiddenError } from "@/auth/authorization";
import { createPaymentLinkV2PrefillService } from "./payment-link-v2-prefill";

const owner = { id: "440e8400-e29b-41d4-a716-446655440001", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const linkId = "440e8400-e29b-41d4-a716-446655440010";

const ownedLink = {
  id: linkId,
  identifier: "abcdefghijklmnopqrstuvwx",
  compositionKind: "PRODUCT_LINES" as const,
  descriptionPtBr: null,
  descriptionEn: null,
  amount: null,
  currencyPairId: "440e8400-e29b-41d4-a716-446655440020",
  linkType: "REUSABLE" as const,
  expiresAt: null,
  active: true,
  version: 7,
  createdAt: new Date("2026-07-01T12:00:00.000Z"),
  updatedAt: new Date("2026-07-02T12:00:00.000Z"),
  lines: [
    { productId: "440e8400-e29b-41d4-a716-446655440030", position: 1, quantity: 2 },
    { productId: "440e8400-e29b-41d4-a716-446655440031", position: 2, quantity: 1 },
  ],
};

describe("payment-link V2 owner prefill read", () => {
  it("requires an active merchant principal before any read", async () => {
    const findOwned = vi.fn();
    const hasCheckoutAttempt = vi.fn().mockResolvedValue(false);
    const service = createPaymentLinkV2PrefillService({ findOwned, hasCheckoutAttempt });
    await expect(service.getForOwner({ ...owner, role: "ADMIN" }, linkId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.getForOwner({ ...owner, status: "DISABLED" }, linkId)).rejects.toBeInstanceOf(ForbiddenError);
    expect(findOwned).not.toHaveBeenCalled();
  });

  it("returns the version, position-ordered line product identifiers, and the checkout-attempt flag", async () => {
    const findOwned = vi.fn().mockResolvedValue(ownedLink);
    const hasCheckoutAttempt = vi.fn().mockResolvedValue(false);
    const service = createPaymentLinkV2PrefillService({ findOwned, hasCheckoutAttempt });
    const prefill = await service.getForOwner(owner, linkId.toUpperCase());
    expect(findOwned).toHaveBeenCalledWith(owner.id, linkId);
    expect(hasCheckoutAttempt).toHaveBeenCalledWith(linkId);
    expect(prefill).toEqual({
      version: 7,
      lineProductIds: ["440e8400-e29b-41d4-a716-446655440030", "440e8400-e29b-41d4-a716-446655440031"],
      hasCheckoutAttempt: false,
    });
    expect(Object.keys(prefill ?? {}).sort()).toEqual(["hasCheckoutAttempt", "lineProductIds", "version"]);
  });

  // 14.5.2 F02 regression: the flag rides the read as a genuine attempt-
  // existence check, never a hardcoded false — the financial lock and the
  // new-version banner would otherwise never render.
  it("surfaces a true checkout-attempt flag from the store's attempt-existence seam", async () => {
    const findOwned = vi.fn().mockResolvedValue(ownedLink);
    const hasCheckoutAttempt = vi.fn().mockResolvedValue(true);
    const service = createPaymentLinkV2PrefillService({ findOwned, hasCheckoutAttempt });
    const prefill = await service.getForOwner(owner, linkId);
    expect(prefill?.hasCheckoutAttempt).toBe(true);
  });

  it("shares one opaque null for malformed, missing, and cross-owner identities", async () => {
    const findOwned = vi.fn().mockResolvedValue(null);
    const hasCheckoutAttempt = vi.fn().mockResolvedValue(false);
    const service = createPaymentLinkV2PrefillService({ findOwned, hasCheckoutAttempt });
    await expect(service.getForOwner(owner, "not-a-uuid")).resolves.toBeNull();
    expect(findOwned).not.toHaveBeenCalled();
    await expect(service.getForOwner(owner, linkId)).resolves.toBeNull();
    expect(findOwned).toHaveBeenCalledTimes(1);
  });
});
