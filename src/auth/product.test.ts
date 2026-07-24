import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ForbiddenError } from "./authorization";
import { createTestProductStore } from "./product-test-store";
import { NoActiveExchangeCurrencyMappingError } from "./supported-exchange-currency";
import {
  createProductService,
  ProductConflictError,
  ProductValidationError,
  type ProductDeps,
  type ProductStore,
  type ProductValues,
} from "./product";

const admin = {
  id: "admin",
  username: "admin",
  email: null,
  role: "ADMIN" as const,
  status: "ACTIVE" as const,
  createdAt: new Date(),
};
const user = { ...admin, role: "USER" as const };
const secondUser = { ...user, id: "second-user" };
const disabledAdmin = { ...admin, status: "DISABLED" as const };

const validValues = (overrides: Record<string, unknown> = {}) => ({
  internalName: "Donation",
  titlePtBr: "Doação",
  titleEn: "Donation",
  descriptionPtBr: "Apoie o projeto.",
  descriptionEn: "Support the project.",
  price: "10.25",
  ...overrides,
});

describe("product service", () => {
  it("allows active accounts to manage their own products", async () => {
    const service = createProductService(createTestProductStore());

    await expect(service.listForOwner(user)).resolves.toEqual([]);
    await expect(service.create(user, validValues())).resolves.toMatchObject({ internalName: "Donation" });
    await expect(service.create(disabledAdmin, validValues())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("denies administrators before validation or persistence", async () => {
    const testStore: ProductStore = {
      list: vi.fn(),
      findOwned: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      setActive: vi.fn(),
      archive: vi.fn(),
      delete: vi.fn(),
    };
    const service = createProductService(testStore);

    await expect(service.listForOwner(admin)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.create(admin, {} as never)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.update(admin, null, null, {} as never)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.setActive(admin, null, null, null)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.archive(admin, null, null)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.delete(admin, null, null)).rejects.toBeInstanceOf(ForbiddenError);
    expect(Object.values(testStore).every((operation) => !vi.mocked(operation).mock.calls.length)).toBe(true);
  });

  it("keeps lists and mutations inside the actor's persisted owner boundary", async () => {
    const store = createTestProductStore();
    const service = createProductService(store);
    const product = await service.create(user, validValues());

    await expect(service.listForOwner(secondUser)).resolves.toEqual([]);
    await expect(service.update(secondUser, product.id, 0, validValues())).rejects.toBeInstanceOf(ProductConflictError);
    await expect(service.delete(secondUser, product.id, 0)).rejects.toBeInstanceOf(ProductConflictError);
    expect(store.products).toHaveLength(1);
  });

  it("trims Unicode boundary whitespace, preserves internal content, and measures code points", async () => {
    const store = createTestProductStore();
    const service = createProductService(store);
    const product = await service.create(
      user,
      validValues({
        internalName: `\u3000${"😀".repeat(128)}\u00a0`,
        titlePtBr: "\ufeff Título público \u2009",
        descriptionEn: "\n First line \n Second line \n",
      }),
    );

    expect([...product.internalName]).toHaveLength(128);
    expect(product.internalName).toBe("😀".repeat(128));
    expect(product.titlePtBr).toBe("Título público");
    expect(product.descriptionEn).toBe("First line \n Second line");

    await expect(
      service.create(user, validValues({ internalName: "😀".repeat(129) })),
    ).rejects.toBeInstanceOf(ProductValidationError);
  });

  it("rejects missing, whitespace-only, overlong, and multiline single-line text", async () => {
    const service = createProductService(createTestProductStore());
    const invalidValues: Array<Partial<Record<keyof ProductValues, unknown>>> = [
      { internalName: "\u00a0\u3000" },
      { internalName: "line one\nline two" },
      { titlePtBr: "line one\rline two" },
      { titleEn: "a".repeat(161) },
      { descriptionPtBr: "a".repeat(2_001) },
      { descriptionEn: null },
    ];

    for (const values of invalidValues) {
      await expect(service.create(user, validValues(values))).rejects.toBeInstanceOf(ProductValidationError);
    }
  });

  it("preserves every accepted price exactly without numeric conversion", async () => {
    const service = createProductService(createTestProductStore());

    for (const price of ["0.000001", "1", "10.25", "999999999999.999999"]) {
      await expect(service.create(user, validValues({ price }))).resolves.toMatchObject({ price });
    }
  });

  it("rejects zero, noncanonical, signed, exponent, separated, and overflowing prices", async () => {
    const service = createProductService(createTestProductStore());
    const invalidPrices = [
      "0",
      "0.0",
      "00.1",
      "01",
      "1.0",
      "1.",
      ".1",
      "+1",
      "-1",
      "1e2",
      "1,25",
      "1 000",
      " 1",
      "1 ",
      "1000000000000",
      "1.0000001",
    ];

    for (const price of invalidPrices) {
      await expect(service.create(user, validValues({ price }))).rejects.toBeInstanceOf(ProductValidationError);
    }
  });

  it("updates values and active state only at the expected version", async () => {
    const store = createTestProductStore();
    const service = createProductService(store);
    const created = await service.create(user, validValues());

    const updated = await service.update(user, created.id.toUpperCase(), "0", validValues({ price: "20" }));
    expect(updated).toMatchObject({ id: created.id, price: "20", version: 1 });
    const inactive = await service.setActive(user, created.id, 1, "false");
    expect(inactive).toMatchObject({ active: false, version: 2 });

    await expect(service.update(user, created.id, 0, validValues())).rejects.toBeInstanceOf(ProductConflictError);
    await expect(service.setActive(user, created.id, 1, true)).rejects.toBeInstanceOf(ProductConflictError);
    expect(store.products[0]).toMatchObject({ price: "20", active: false, version: 2 });
  });

  it("makes stale and unknown mutations equally opaque", async () => {
    const store = createTestProductStore();
    const service = createProductService(store);
    const product = await service.create(user, validValues());

    await expect(service.delete(user, randomUUID(), 0)).rejects.toBeInstanceOf(ProductConflictError);
    await expect(service.delete(user, product.id, 1)).rejects.toBeInstanceOf(ProductConflictError);
    expect(store.products).toHaveLength(1);
    await expect(service.delete(user, product.id, 0)).resolves.toBeUndefined();
    expect(store.products).toHaveLength(0);
  });

  it("rejects malformed identifiers, versions, and active states before persistence", async () => {
    const store = createTestProductStore();
    const service = createProductService(store);
    const product = await service.create(user, validValues());

    for (const id of ["not-a-uuid", ` ${product.id}`, null]) {
      await expect(service.delete(user, id, 0)).rejects.toBeInstanceOf(ProductValidationError);
    }
    for (const version of ["", "01", "-1", "1.5", "2147483648", Number.NaN]) {
      await expect(service.delete(user, product.id, version)).rejects.toBeInstanceOf(ProductValidationError);
    }
    for (const active of ["yes", "1", 1, null]) {
      await expect(service.setActive(user, product.id, 0, active)).rejects.toBeInstanceOf(ProductValidationError);
    }
    expect(store.products).toHaveLength(1);
  });
});

function createDeps(calls: string[] = []): ProductDeps {
  return {
    requireActiveCurrencyPair: vi.fn(async () => {
      calls.push("require-pair");
    }),
    activateOwnedProductImage: vi.fn(async (_actor, identifier: string) => {
      calls.push(`activate:${identifier}`);
    }),
    orphanOwnedProductImage: vi.fn(async (_actor, identifier: string) => {
      calls.push(`orphan:${identifier}`);
    }),
  };
}

const firstImage = "a".repeat(43);
const secondImage = "b".repeat(43);

describe("product currency assignment", () => {
  it("keeps currency-less products valid without touching the registry", async () => {
    const deps = createDeps();
    const service = createProductService(createTestProductStore(), deps);

    const product = await service.create(user, validValues());
    expect(product.currencyCode).toBeNull();
    expect(deps.requireActiveCurrencyPair).not.toHaveBeenCalled();
  });

  it("gates a new non-null assignment on an active mapping", async () => {
    const deps = createDeps();
    const service = createProductService(createTestProductStore(), deps);

    const product = await service.create(user, validValues({ currencyCode: "USD" }));
    expect(product.currencyCode).toBe("USD");
    expect(deps.requireActiveCurrencyPair).toHaveBeenCalledWith("USD");
  });

  it("surfaces only the typed unavailable signal when no active mapping exists", async () => {
    const store = createTestProductStore();
    const deps = createDeps();
    vi.mocked(deps.requireActiveCurrencyPair).mockRejectedValue(new NoActiveExchangeCurrencyMappingError());
    const service = createProductService(store, deps);

    await expect(service.create(user, validValues({ currencyCode: "USD" }))).rejects.toBeInstanceOf(
      NoActiveExchangeCurrencyMappingError,
    );
    expect(store.products).toHaveLength(0);
  });

  it("re-gates only a changed code, never a re-submitted or cleared one", async () => {
    const deps = createDeps();
    const service = createProductService(createTestProductStore(), deps);
    const product = await service.create(user, validValues({ currencyCode: "USD" }));
    vi.mocked(deps.requireActiveCurrencyPair).mockClear();
    vi.mocked(deps.requireActiveCurrencyPair).mockRejectedValue(new NoActiveExchangeCurrencyMappingError());

    const unchanged = await service.update(user, product.id, 0, validValues({ currencyCode: "USD" }));
    expect(unchanged.currencyCode).toBe("USD");
    const cleared = await service.update(user, product.id, 1, validValues({ currencyCode: "" }));
    expect(cleared.currencyCode).toBeNull();
    expect(deps.requireActiveCurrencyPair).not.toHaveBeenCalled();

    await expect(service.update(user, product.id, 2, validValues({ currencyCode: "EUR" }))).rejects.toBeInstanceOf(
      NoActiveExchangeCurrencyMappingError,
    );
    expect(deps.requireActiveCurrencyPair).toHaveBeenCalledWith("EUR");
  });

  it("rejects malformed currency codes before persistence or the registry", async () => {
    const store = createTestProductStore();
    const deps = createDeps();
    const service = createProductService(store, deps);

    for (const currencyCode of ["US", "US1", "usd", "USDD", 1]) {
      await expect(service.create(user, validValues({ currencyCode }))).rejects.toBeInstanceOf(ProductValidationError);
    }
    expect(deps.requireActiveCurrencyPair).not.toHaveBeenCalled();
    expect(store.products).toHaveLength(0);
  });
});

describe("product image lifecycle", () => {
  it("activates a caller-staged image before saving the assignment", async () => {
    const calls: string[] = [];
    const deps = createDeps(calls);
    const store = createTestProductStore();
    const create = store.create.bind(store);
    store.create = async (...args: Parameters<typeof create>) => {
      calls.push("save");
      return create(...args);
    };
    const service = createProductService(store, deps);

    const product = await service.create(user, validValues({ imageMediaId: firstImage }));
    expect(product.imageMediaId).toBe(firstImage);
    expect(calls).toEqual([`activate:${firstImage}`, "save"]);
    expect(deps.orphanOwnedProductImage).not.toHaveBeenCalled();
  });

  it("activates the replacement before saving and orphans the replaced image after", async () => {
    const calls: string[] = [];
    const deps = createDeps(calls);
    const store = createTestProductStore();
    const service = createProductService(store, deps);
    const product = await service.create(user, validValues({ imageMediaId: firstImage }));
    calls.length = 0;
    const update = store.update.bind(store);
    store.update = async (...args: Parameters<typeof update>) => {
      calls.push("save");
      return update(...args);
    };

    const updated = await service.update(user, product.id, 0, validValues({ imageMediaId: secondImage }));
    expect(updated.imageMediaId).toBe(secondImage);
    expect(calls).toEqual([`activate:${secondImage}`, "save", `orphan:${firstImage}`]);
  });

  it("orphans the removed image only after the removal is saved", async () => {
    const calls: string[] = [];
    const deps = createDeps(calls);
    const store = createTestProductStore();
    const service = createProductService(store, deps);
    const product = await service.create(user, validValues({ imageMediaId: firstImage }));
    calls.length = 0;
    const update = store.update.bind(store);
    store.update = async (...args: Parameters<typeof update>) => {
      calls.push("save");
      return update(...args);
    };

    const updated = await service.update(user, product.id, 0, validValues({ imageMediaId: "" }));
    expect(updated.imageMediaId).toBeNull();
    expect(calls).toEqual(["save", `orphan:${firstImage}`]);
  });

  it("leaves an unchanged image reference untouched by the media boundary", async () => {
    const deps = createDeps();
    const service = createProductService(createTestProductStore(), deps);
    const product = await service.create(user, validValues({ imageMediaId: firstImage }));
    vi.mocked(deps.activateOwnedProductImage).mockClear();
    vi.mocked(deps.orphanOwnedProductImage).mockClear();

    const updated = await service.update(user, product.id, 0, validValues({ imageMediaId: firstImage, price: "20" }));
    expect(updated.imageMediaId).toBe(firstImage);
    expect(deps.activateOwnedProductImage).not.toHaveBeenCalled();
    expect(deps.orphanOwnedProductImage).not.toHaveBeenCalled();
  });

  it("compensates the activated image when the save fails", async () => {
    const calls: string[] = [];
    const deps = createDeps(calls);
    const store = createTestProductStore();
    store.create = async () => null;
    const service = createProductService(store, deps);

    await expect(service.create(user, validValues({ imageMediaId: firstImage }))).rejects.toBeInstanceOf(
      ProductConflictError,
    );
    expect(calls).toEqual([`activate:${firstImage}`, `orphan:${firstImage}`]);
  });

  it("rejects wrong-owner, wrong-purpose, or non-staged media as one opaque failure", async () => {
    const store = createTestProductStore();
    const deps = createDeps();
    vi.mocked(deps.activateOwnedProductImage).mockRejectedValue(new Error("Media is unavailable"));
    const service = createProductService(store, deps);

    await expect(service.create(user, validValues({ imageMediaId: firstImage }))).rejects.toThrow("Media is unavailable");
    expect(store.products).toHaveLength(0);
    expect(deps.orphanOwnedProductImage).not.toHaveBeenCalled();
  });

  it("rejects malformed image identifiers before the media boundary", async () => {
    const store = createTestProductStore();
    const deps = createDeps();
    const service = createProductService(store, deps);

    for (const imageMediaId of ["short", "a".repeat(44), `${"a".repeat(42)}+`, 1]) {
      await expect(service.create(user, validValues({ imageMediaId }))).rejects.toBeInstanceOf(ProductValidationError);
    }
    expect(deps.activateOwnedProductImage).not.toHaveBeenCalled();
    expect(store.products).toHaveLength(0);
  });
});

describe("product archival", () => {
  it("archives irreversibly in one compare-and-swap mutation", async () => {
    const store = createTestProductStore();
    const service = createProductService(store);
    const product = await service.create(user, validValues());

    const archived = await service.archive(user, product.id, 0);
    expect(archived.active).toBe(false);
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(archived.version).toBe(1);

    await expect(service.archive(user, product.id, 1)).rejects.toBeInstanceOf(ProductConflictError);
    await expect(service.archive(user, product.id, 0)).rejects.toBeInstanceOf(ProductConflictError);
    expect(store.products[0]).toMatchObject({ active: false, version: 1 });
    expect(store.products[0].archivedAt).toBeInstanceOf(Date);
  });

  it("locks every edit and reactivation once archived", async () => {
    const deps = createDeps();
    const store = createTestProductStore();
    const service = createProductService(store, deps);
    const product = await service.create(user, validValues({ currencyCode: "EUR", imageMediaId: firstImage }));
    await service.archive(user, product.id, 0);

    await expect(service.update(user, product.id, 1, validValues())).rejects.toBeInstanceOf(ProductConflictError);
    await expect(service.setActive(user, product.id, 1, "true")).rejects.toBeInstanceOf(ProductConflictError);
    await expect(service.setActive(user, product.id, 1, "false")).rejects.toBeInstanceOf(ProductConflictError);
    expect(store.products[0]).toMatchObject({ price: "10.25", active: false, currencyCode: "EUR", imageMediaId: firstImage });
    expect(deps.requireActiveCurrencyPair).toHaveBeenCalledTimes(1);
    expect(deps.activateOwnedProductImage).toHaveBeenCalledTimes(1);
    expect(deps.orphanOwnedProductImage).not.toHaveBeenCalled();
  });

  it("keeps archived products readable in the owner list", async () => {
    const store = createTestProductStore();
    const service = createProductService(store);
    const product = await service.create(user, validValues());
    await service.archive(user, product.id, 0);

    const products = await service.listForOwner(user);
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ id: product.id, active: false });
    expect(products[0].archivedAt).toBeInstanceOf(Date);
  });

  it("keeps the V1 delete outcome for unreferenced archived products", async () => {
    const store = createTestProductStore();
    const service = createProductService(store);
    const product = await service.create(user, validValues());
    await service.archive(user, product.id, 0);

    await expect(service.delete(user, product.id, 1)).resolves.toBeUndefined();
    expect(store.products).toHaveLength(0);
  });
});

describe("product category selection", () => {
  const category = { id: randomUUID(), ownerId: user.id, active: true };

  it("assigns and clears an active same-owner category", async () => {
    const store = createTestProductStore();
    store.categories.push(category);
    const service = createProductService(store);

    const product = await service.create(user, validValues({ categoryId: category.id.toUpperCase() }));
    expect(product.categoryId).toBe(category.id);
    const updated = await service.update(user, product.id, 0, validValues({ categoryId: "" }));
    expect(updated.categoryId).toBeNull();
  });

  it("rejects unknown, inactive, and cross-owner categories with one opaque conflict", async () => {
    const store = createTestProductStore();
    store.categories.push(category, { id: randomUUID(), ownerId: user.id, active: false });
    const service = createProductService(store);

    await expect(service.create(user, validValues({ categoryId: randomUUID() }))).rejects.toBeInstanceOf(ProductConflictError);
    await expect(service.create(user, validValues({ categoryId: store.categories[1].id }))).rejects.toBeInstanceOf(ProductConflictError);
    await expect(service.create(secondUser, validValues({ categoryId: category.id }))).rejects.toBeInstanceOf(ProductConflictError);
    expect(store.products).toHaveLength(0);
  });

  it("rejects malformed category identifiers before persistence", async () => {
    const store = createTestProductStore();
    const service = createProductService(store);

    for (const categoryId of ["not-a-uuid", 1]) {
      await expect(service.create(user, validValues({ categoryId }))).rejects.toBeInstanceOf(ProductValidationError);
    }
    expect(store.products).toHaveLength(0);
  });
});
