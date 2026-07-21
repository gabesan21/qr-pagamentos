import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPublicProductService,
  type PublicProductRecord,
  type PublicProductStore,
} from "./public-product";

const product: PublicProductRecord = {
  titlePtBr: "Doação",
  titleEn: "Donation",
  descriptionPtBr: "Apoie o projeto.\nObrigado!",
  descriptionEn: "Support the project.\nThank you!",
  price: "999999999999.999999",
};

function store(result: PublicProductRecord | null = product): PublicProductStore & {
  findActiveById: ReturnType<typeof vi.fn>;
} {
  return { findActiveById: vi.fn().mockResolvedValue(result) };
}

describe("public product service", () => {
  it("reads an active product once and projects its requested public locale", async () => {
    const activeStore = store();
    const service = createPublicProductService(activeStore);
    const id = randomUUID();

    await expect(service.read(id.toUpperCase(), "pt-BR")).resolves.toEqual({
      title: "Doação",
      description: "Apoie o projeto.\nObrigado!",
      price: "999999999999.999999",
    });
    await expect(service.read(id, "en")).resolves.toEqual({
      title: "Donation",
      description: "Support the project.\nThank you!",
      price: "999999999999.999999",
    });
    expect(activeStore.findActiveById).toHaveBeenNthCalledWith(1, id);
    expect(activeStore.findActiveById).toHaveBeenNthCalledWith(2, id);
  });

  it("returns exactly the redacted public fields without changing the canonical price", async () => {
    const service = createPublicProductService(store({
      ...product,
      price: "0.000001",
    }));

    const result = await service.read(randomUUID(), "en");

    expect(result).toEqual({
      title: "Donation",
      description: "Support the project.\nThank you!",
      price: "0.000001",
    });
    expect(Object.keys(result ?? {}).sort()).toEqual(["description", "price", "title"]);
  });

  it("collapses malformed, missing, and inactive products to null", async () => {
    const malformedStore = store();
    const missingStore = store(null);
    const inactiveStore = store(null);

    await expect(createPublicProductService(malformedStore).read("not-a-uuid", "pt-BR")).resolves.toBeNull();
    await expect(createPublicProductService(missingStore).read(randomUUID(), "pt-BR")).resolves.toBeNull();
    await expect(createPublicProductService(inactiveStore).read(randomUUID(), "en")).resolves.toBeNull();
    expect(malformedStore.findActiveById).not.toHaveBeenCalled();
    expect(missingStore.findActiveById).toHaveBeenCalledOnce();
    expect(inactiveStore.findActiveById).toHaveBeenCalledOnce();
  });
});
