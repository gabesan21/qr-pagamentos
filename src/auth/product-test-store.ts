import { randomUUID } from "node:crypto";

import type { AdminProduct, ProductStore, ProductValues } from "./product";

export type TestProductStore = ProductStore & { products: AdminProduct[] };

function timestamp() {
  return new Date("2026-07-20T12:00:00.000Z");
}

export function createTestProductStore(): TestProductStore {
  return {
    products: [],
    async list() {
      return [...this.products].sort(
        (left, right) => left.internalName.localeCompare(right.internalName) || left.id.localeCompare(right.id),
      );
    },
    async create(values: ProductValues) {
      const product: AdminProduct = {
        id: randomUUID(),
        ...values,
        active: true,
        version: 0,
        createdAt: timestamp(),
        updatedAt: timestamp(),
      };
      this.products.push(product);
      return product;
    },
    async update(id, version, values) {
      const product = this.products.find((candidate) => candidate.id === id && candidate.version === version);
      if (!product) return null;
      Object.assign(product, values, { version: product.version + 1, updatedAt: timestamp() });
      return product;
    },
    async setActive(id, version, active) {
      const product = this.products.find((candidate) => candidate.id === id && candidate.version === version);
      if (!product) return null;
      Object.assign(product, { active, version: product.version + 1, updatedAt: timestamp() });
      return product;
    },
    async delete(id, version) {
      const index = this.products.findIndex((candidate) => candidate.id === id && candidate.version === version);
      if (index < 0) return false;
      this.products.splice(index, 1);
      return true;
    },
  };
}
