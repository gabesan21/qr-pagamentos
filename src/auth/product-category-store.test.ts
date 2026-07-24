import { describe, expect, it, vi } from "vitest";

import { createDatabaseProductCategoryStore } from "./product-category";

describe("database product category store", () => {
  it("locks source and replacement in identifier order and atomically reassigns before deactivation", async () => {
    const sourceId = "ff0e8400-e29b-41d4-a716-446655440000";
    const replacementId = "110e8400-e29b-41d4-a716-446655440000";
    const ownerId = "220e8400-e29b-41d4-a716-446655440000";
    const transaction = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([
        { id: replacementId, active: true, version: 4 },
        { id: sourceId, active: true, version: 2 },
      ]),
      $queryRaw: vi.fn().mockResolvedValue([{ id: "product" }]),
      product: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      productCategory: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const database = {
      $transaction: vi.fn(async (operation, options) => {
        expect(options).toEqual({ isolationLevel: "Serializable" });
        return operation(transaction);
      }),
    };
    const store = createDatabaseProductCategoryStore(database as never);

    await expect(store.deactivate(ownerId, sourceId, 2, replacementId)).resolves.toBe(true);
    expect(transaction.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY id"),
      ownerId,
      replacementId,
      sourceId,
    );
    expect(transaction.product.updateMany).toHaveBeenCalledWith({
      where: { ownerId, categoryId: sourceId },
      data: { categoryId: replacementId },
    });
    expect(transaction.productCategory.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: sourceId, ownerId, version: 2, active: true },
      data: expect.objectContaining({ active: false, version: { increment: 1 } }),
    }));
    expect(transaction.product.updateMany.mock.invocationCallOrder[0])
      .toBeLessThan(transaction.productCategory.updateMany.mock.invocationCallOrder[0]);
  });

  it("performs no product or category write when the replacement is unavailable", async () => {
    const sourceId = "ff0e8400-e29b-41d4-a716-446655440000";
    const replacementId = "110e8400-e29b-41d4-a716-446655440000";
    const transaction = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ id: sourceId, active: true, version: 0 }]),
      $queryRaw: vi.fn(),
      product: { updateMany: vi.fn() },
      productCategory: { updateMany: vi.fn() },
    };
    const database = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
    };
    const store = createDatabaseProductCategoryStore(database as never);

    await expect(store.deactivate(
      "220e8400-e29b-41d4-a716-446655440000",
      sourceId,
      0,
      replacementId,
    )).resolves.toBe(false);
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
    expect(transaction.product.updateMany).not.toHaveBeenCalled();
    expect(transaction.productCategory.updateMany).not.toHaveBeenCalled();
  });
});
