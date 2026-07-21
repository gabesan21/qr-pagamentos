import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createTestProductStore } from "./product-test-store";
import {
  createProductService,
  ProductConflictError,
  ProductValidationError,
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

const validValues = (overrides: Partial<Record<keyof ProductValues, unknown>> = {}) => ({
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

    await expect(service.listForOwner(admin)).resolves.toEqual([]);
    await expect(service.create(user, validValues())).resolves.toMatchObject({ internalName: "Donation" });
    await expect(service.create(disabledAdmin, validValues())).rejects.toThrow("Active account access is required");
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
      admin,
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
      service.create(admin, validValues({ internalName: "😀".repeat(129) })),
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
      await expect(service.create(admin, validValues(values))).rejects.toBeInstanceOf(ProductValidationError);
    }
  });

  it("preserves every accepted price exactly without numeric conversion", async () => {
    const service = createProductService(createTestProductStore());

    for (const price of ["0.000001", "1", "10.25", "999999999999.999999"]) {
      await expect(service.create(admin, validValues({ price }))).resolves.toMatchObject({ price });
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
      await expect(service.create(admin, validValues({ price }))).rejects.toBeInstanceOf(ProductValidationError);
    }
  });

  it("updates values and active state only at the expected version", async () => {
    const store = createTestProductStore();
    const service = createProductService(store);
    const created = await service.create(admin, validValues());

    const updated = await service.update(admin, created.id.toUpperCase(), "0", validValues({ price: "20" }));
    expect(updated).toMatchObject({ id: created.id, price: "20", version: 1 });
    const inactive = await service.setActive(admin, created.id, 1, "false");
    expect(inactive).toMatchObject({ active: false, version: 2 });

    await expect(service.update(admin, created.id, 0, validValues())).rejects.toBeInstanceOf(ProductConflictError);
    await expect(service.setActive(admin, created.id, 1, true)).rejects.toBeInstanceOf(ProductConflictError);
    expect(store.products[0]).toMatchObject({ price: "20", active: false, version: 2 });
  });

  it("makes stale and unknown mutations equally opaque", async () => {
    const store = createTestProductStore();
    const service = createProductService(store);
    const product = await service.create(admin, validValues());

    await expect(service.delete(admin, randomUUID(), 0)).rejects.toBeInstanceOf(ProductConflictError);
    await expect(service.delete(admin, product.id, 1)).rejects.toBeInstanceOf(ProductConflictError);
    expect(store.products).toHaveLength(1);
    await expect(service.delete(admin, product.id, 0)).resolves.toBeUndefined();
    expect(store.products).toHaveLength(0);
  });

  it("rejects malformed identifiers, versions, and active states before persistence", async () => {
    const store = createTestProductStore();
    const service = createProductService(store);
    const product = await service.create(admin, validValues());

    for (const id of ["not-a-uuid", ` ${product.id}`, null]) {
      await expect(service.delete(admin, id, 0)).rejects.toBeInstanceOf(ProductValidationError);
    }
    for (const version of ["", "01", "-1", "1.5", "2147483648", Number.NaN]) {
      await expect(service.delete(admin, product.id, version)).rejects.toBeInstanceOf(ProductValidationError);
    }
    for (const active of ["yes", "1", 1, null]) {
      await expect(service.setActive(admin, product.id, 0, active)).rejects.toBeInstanceOf(ProductValidationError);
    }
    expect(store.products).toHaveLength(1);
  });
});
