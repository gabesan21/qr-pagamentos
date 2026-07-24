import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "./authorization";
import {
  createProductCategoryService,
  ProductCategoryConflictError,
  ProductCategoryValidationError,
  type OwnerProductCategory,
  type ProductCategoryStore,
  type ProductCategoryValues,
} from "./product-category";

const principal = (id: string, role: "USER" | "ADMIN" = "USER", status: "ACTIVE" | "DISABLED" = "ACTIVE") => ({
  id,
  username: id,
  email: null,
  role,
  status,
  createdAt: new Date(),
});

function testStore() {
  const categories: Array<OwnerProductCategory & { ownerId: string }> = [];
  const productCategories: Array<{ ownerId: string; categoryId: string | null }> = [];
  let serial = Promise.resolve();

  const store: ProductCategoryStore = {
    async list(ownerId) {
      return categories.filter((category) => category.ownerId === ownerId);
    },
    async create(ownerId, values) {
      if (categories.some((category) => category.ownerId === ownerId
        && (category.namePtBr === values.namePtBr || category.nameEn === values.nameEn))) return null;
      const now = new Date();
      const category = {
        id: randomUUID(),
        ownerId,
        ...values,
        active: true,
        version: 0,
        createdAt: now,
        updatedAt: now,
      };
      categories.push(category);
      return category;
    },
    async update(ownerId, id, version, values) {
      const category = categories.find((candidate) =>
        candidate.ownerId === ownerId && candidate.id === id && candidate.version === version && candidate.active);
      if (!category || categories.some((candidate) => candidate !== category
        && candidate.ownerId === ownerId
        && (candidate.namePtBr === values.namePtBr || candidate.nameEn === values.nameEn))) return null;
      Object.assign(category, values, { version: version + 1, updatedAt: new Date() });
      return category;
    },
    async deactivate(ownerId, id, version, replacementId) {
      let release!: () => void;
      const previous = serial;
      serial = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        const source = categories.find((candidate) =>
          candidate.ownerId === ownerId && candidate.id === id && candidate.version === version && candidate.active);
        const replacement = replacementId === null ? null : categories.find((candidate) =>
          candidate.ownerId === ownerId && candidate.id === replacementId && candidate.active);
        if (!source || (replacementId !== null && !replacement)) return false;
        const referenced = productCategories.filter((product) =>
          product.ownerId === ownerId && product.categoryId === id);
        if (referenced.length > 0 && replacement === null) return false;
        for (const product of referenced) product.categoryId = replacement!.id;
        source.active = false;
        source.version += 1;
        return true;
      } finally {
        release();
      }
    },
  };
  return { store, categories, productCategories };
}

const values = (overrides: Partial<Record<keyof ProductCategoryValues, unknown>> = {}) => ({
  namePtBr: "Doações",
  nameEn: "Donations",
  ...overrides,
});

describe("owner product category service", () => {
  it("denies administrators and disabled owners before validation or persistence", async () => {
    const store: ProductCategoryStore = {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deactivate: vi.fn(),
    };
    const service = createProductCategoryService(store);

    await expect(service.create(principal("admin", "ADMIN"), {} as never)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.update(principal("disabled", "USER", "DISABLED"), null, null, {} as never))
      .rejects.toBeInstanceOf(ForbiddenError);
    expect(Object.values(store).every((operation) => !vi.mocked(operation).mock.calls.length)).toBe(true);
  });

  it("trims names, preserves internal whitespace, and enforces bilingual single-line bounds", async () => {
    const service = createProductCategoryService(testStore().store);
    const owner = principal("owner");

    await expect(service.create(owner, values({
      namePtBr: "\u3000Doações   livres\u00a0",
      nameEn: ` ${"😀".repeat(160)} `,
    }))).resolves.toMatchObject({
      namePtBr: "Doações   livres",
      nameEn: "😀".repeat(160),
    });
    for (const invalid of [
      values({ namePtBr: " " }),
      values({ nameEn: "line\nbreak" }),
      values({ namePtBr: "a".repeat(161) }),
    ]) {
      await expect(service.create(owner, invalid)).rejects.toBeInstanceOf(ProductCategoryValidationError);
    }
  });

  it("keeps exact bilingual names unique per owner and hides cross-owner, stale, and inactive targets", async () => {
    const fixture = testStore();
    const service = createProductCategoryService(fixture.store);
    const owner = principal("owner");
    const other = principal("other");
    const category = await service.create(owner, values());

    await expect(service.create(owner, values())).rejects.toBeInstanceOf(ProductCategoryConflictError);
    await expect(service.create(other, values())).resolves.toMatchObject({ namePtBr: "Doações" });
    await expect(service.update(other, category.id, 0, values({ nameEn: "Other" })))
      .rejects.toBeInstanceOf(ProductCategoryConflictError);
    await expect(service.update(owner, category.id, 1, values({ nameEn: "Stale" })))
      .rejects.toBeInstanceOf(ProductCategoryConflictError);
    await service.deactivate(owner, category.id, 0, null);
    await expect(service.update(owner, category.id, 1, values({ nameEn: "Inactive" })))
      .rejects.toBeInstanceOf(ProductCategoryConflictError);
  });

  it("requires a distinct active same-owner replacement and reassigns every current product atomically", async () => {
    const fixture = testStore();
    const service = createProductCategoryService(fixture.store);
    const owner = principal("owner");
    const other = principal("other");
    const source = await service.create(owner, values());
    const replacement = await service.create(owner, values({ namePtBr: "Cursos", nameEn: "Courses" }));
    const foreign = await service.create(other, values({ namePtBr: "Cursos", nameEn: "Courses" }));
    fixture.productCategories.push(
      { ownerId: owner.id, categoryId: source.id },
      { ownerId: owner.id, categoryId: source.id },
    );

    await expect(service.deactivate(owner, source.id, 0, null)).rejects.toBeInstanceOf(ProductCategoryConflictError);
    await expect(service.deactivate(owner, source.id, 0, foreign.id)).rejects.toBeInstanceOf(ProductCategoryConflictError);
    expect(fixture.productCategories.every((product) => product.categoryId === source.id)).toBe(true);
    await service.deactivate(owner, source.id, 0, replacement.id);
    expect(fixture.productCategories.every((product) => product.categoryId === replacement.id)).toBe(true);
    expect(fixture.categories.find((category) => category.id === source.id)).toMatchObject({ active: false, version: 1 });
  });

  it("serializes competing deactivations so only one expected-version mutation commits", async () => {
    const fixture = testStore();
    const service = createProductCategoryService(fixture.store);
    const owner = principal("owner");
    const source = await service.create(owner, values());

    const outcomes = await Promise.allSettled([
      service.deactivate(owner, source.id, 0, null),
      service.deactivate(owner, source.id, 0, null),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) =>
      outcome.status === "rejected" && outcome.reason instanceof ProductCategoryConflictError)).toHaveLength(1);
  });
});
