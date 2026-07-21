import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createPublicCheckoutPresentationService } from "./public-checkout-presentation";

const identifier = "AbCdEfGhIjKlMnOpQrStUvWx";
const record = {
  product: { titlePtBr: "Doação", titleEn: "Donation", descriptionPtBr: "Apoie o projeto.", descriptionEn: "Support the project.", price: "12.50" },
  owner: { checkoutDataPolicy: "NAME_EMAIL_CPF" as const },
};

describe("public checkout presentation", () => {
  it("projects only localized product facts and the closed checkout policy", async () => {
    const findAvailableByIdentifier = vi.fn().mockResolvedValue(record);
    const service = createPublicCheckoutPresentationService({ findAvailableByIdentifier }, () => new Date("2026-07-21T12:00:00Z"));

    await expect(service.read(identifier, "en")).resolves.toEqual({ product: { title: "Donation", description: "Support the project.", price: "12.50" }, checkoutPolicy: "NAME_EMAIL_CPF" });
    expect(findAvailableByIdentifier).toHaveBeenCalledWith(identifier, new Date("2026-07-21T12:00:00Z"));
  });

  it("does not read storage for malformed identifiers", async () => {
    const findAvailableByIdentifier = vi.fn();
    const service = createPublicCheckoutPresentationService({ findAvailableByIdentifier });

    await expect(service.read("not-an-identifier", "pt-BR")).resolves.toBeNull();
    expect(findAvailableByIdentifier).not.toHaveBeenCalled();
  });
});
