import { randomUUID } from "node:crypto";

import type { OwnerProduct, ProductStore, ProductValues } from "./product";

export type TestProductStore = ProductStore & { products: Array<OwnerProduct & { ownerId: string }> };

function timestamp() {
  return new Date("2026-07-20T12:00:00.000Z");
}

export function createTestProductStore(): TestProductStore {
  return {
    products: [],
    async list(ownerId) {
      return this.products.filter((product) => product.ownerId === ownerId).sort(
        (left, right) => left.internalName.localeCompare(right.internalName) || left.id.localeCompare(right.id),
      );
    },
    async create(ownerId, values: ProductValues) {
      const product = {
        id: randomUUID(),
        ownerId,
        ...values,
        active: true,
        version: 0,
        createdAt: timestamp(),
        updatedAt: timestamp(),
      };
      this.products.push(product);
      return product;
    },
    async update(ownerId, id, version, values) {
      const product = this.products.find((candidate) => candidate.ownerId === ownerId && candidate.id === id && candidate.version === version);
      if (!product) return null;
      Object.assign(product, values, { version: product.version + 1, updatedAt: timestamp() });
      return product;
    },
    async setActive(ownerId, id, version, active) {
      const product = this.products.find((candidate) => candidate.ownerId === ownerId && candidate.id === id && candidate.version === version);
      if (!product) return null;
      Object.assign(product, { active, version: product.version + 1, updatedAt: timestamp() });
      return product;
    },
    async delete(ownerId, id, version) {
      const index = this.products.findIndex((candidate) => candidate.ownerId === ownerId && candidate.id === id && candidate.version === version);
      if (index < 0) return false;
      this.products.splice(index, 1);
      return true;
    },
  };
}
