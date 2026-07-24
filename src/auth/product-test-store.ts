import { randomUUID } from "node:crypto";

import type { OwnerProduct, ProductStore } from "./product";

export type TestProductStore = ProductStore & {
  products: Array<OwnerProduct & { ownerId: string }>;
  categories: Array<{ id: string; ownerId: string; active: boolean }>;
  categoryAssignable(ownerId: string, categoryId: string | null): boolean;
};

function timestamp() {
  return new Date("2026-07-20T12:00:00.000Z");
}

export function createTestProductStore(): TestProductStore {
  return {
    products: [],
    categories: [],
    async list(ownerId) {
      return this.products.filter((product) => product.ownerId === ownerId).sort(
        (left, right) => left.internalName.localeCompare(right.internalName) || left.id.localeCompare(right.id),
      );
    },
    async findOwned(ownerId, id) {
      return this.products.find((candidate) => candidate.ownerId === ownerId && candidate.id === id) ?? null;
    },
    categoryAssignable(ownerId: string, categoryId: string | null) {
      if (categoryId === null) return true;
      return this.categories.some(
        (category) => category.id === categoryId && category.ownerId === ownerId && category.active,
      );
    },
    async create(ownerId, values) {
      if (!this.categoryAssignable(ownerId, values.categoryId)) return null;
      const product = {
        id: randomUUID(),
        ownerId,
        ...values,
        active: true,
        archivedAt: null,
        version: 0,
        createdAt: timestamp(),
        updatedAt: timestamp(),
      };
      this.products.push(product);
      return product;
    },
    async update(ownerId, id, version, values) {
      if (!this.categoryAssignable(ownerId, values.categoryId)) return null;
      const product = this.products.find((candidate) => candidate.ownerId === ownerId && candidate.id === id && candidate.version === version && candidate.archivedAt === null);
      if (!product) return null;
      Object.assign(product, values, { version: product.version + 1, updatedAt: timestamp() });
      return product;
    },
    async setActive(ownerId, id, version, active) {
      const product = this.products.find((candidate) => candidate.ownerId === ownerId && candidate.id === id && candidate.version === version && candidate.archivedAt === null);
      if (!product) return null;
      Object.assign(product, { active, version: product.version + 1, updatedAt: timestamp() });
      return product;
    },
    async archive(ownerId, id, version, archivedAt) {
      const product = this.products.find((candidate) => candidate.ownerId === ownerId && candidate.id === id && candidate.version === version && candidate.archivedAt === null);
      if (!product) return null;
      Object.assign(product, { active: false, archivedAt, version: product.version + 1, updatedAt: timestamp() });
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
