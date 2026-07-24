import { randomUUID } from "node:crypto";

import { getDatabaseClient } from "../db/client";
import { requireUserPrincipal, type Principal } from "./authorization";

export type OwnerProductCategory = {
  id: string;
  namePtBr: string;
  nameEn: string;
  active: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductCategoryValues = Pick<OwnerProductCategory, "namePtBr" | "nameEn">;

export class ProductCategoryValidationError extends Error {}
export class ProductCategoryConflictError extends Error {}

export type ProductCategoryStore = {
  list(ownerId: string): Promise<OwnerProductCategory[]>;
  create(ownerId: string, values: ProductCategoryValues): Promise<OwnerProductCategory | null>;
  update(
    ownerId: string,
    id: string,
    version: number,
    values: ProductCategoryValues,
  ): Promise<OwnerProductCategory | null>;
  deactivate(ownerId: string, id: string, version: number, replacementId: string | null): Promise<boolean>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION_PATTERN = /^(?:0|[1-9][0-9]*)$/;
const MAX_DATABASE_INTEGER = 2_147_483_647;

function validateUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ProductCategoryValidationError(`${field} is invalid`);
  }
  return value.toLowerCase();
}

function validateVersion(value: unknown): number {
  if (typeof value === "number") {
    if (Number.isInteger(value) && value >= 0 && value <= MAX_DATABASE_INTEGER) return value;
    throw new ProductCategoryValidationError("Category version is invalid");
  }
  if (typeof value !== "string" || !VERSION_PATTERN.test(value)) {
    throw new ProductCategoryValidationError("Category version is invalid");
  }
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version > MAX_DATABASE_INTEGER) {
    throw new ProductCategoryValidationError("Category version is invalid");
  }
  return version;
}

function validateName(value: unknown, field: string): string {
  if (typeof value !== "string") throw new ProductCategoryValidationError(`${field} is required`);
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new ProductCategoryValidationError(`${field} is required`);
  if (/[\r\n]/.test(trimmed)) throw new ProductCategoryValidationError(`${field} must be single-line`);
  if ([...trimmed].length > 160) throw new ProductCategoryValidationError(`${field} is too long`);
  return trimmed;
}

function validateValues(input: Record<keyof ProductCategoryValues, unknown>): ProductCategoryValues {
  return {
    namePtBr: validateName(input.namePtBr, "Portuguese category name"),
    nameEn: validateName(input.nameEn, "English category name"),
  };
}

function validateReplacement(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return validateUuid(value, "Replacement category identifier");
}

function requireMatch<T>(value: T | null): T {
  if (value === null) throw new ProductCategoryConflictError("Category mutation is unavailable");
  return value;
}

export function createProductCategoryService(store: ProductCategoryStore) {
  return {
    async listForOwner(actor: Principal) {
      requireUserPrincipal(actor);
      return store.list(actor.id);
    },
    async create(actor: Principal, input: Record<keyof ProductCategoryValues, unknown>) {
      requireUserPrincipal(actor);
      return requireMatch(await store.create(actor.id, validateValues(input)));
    },
    async update(
      actor: Principal,
      id: unknown,
      version: unknown,
      input: Record<keyof ProductCategoryValues, unknown>,
    ) {
      requireUserPrincipal(actor);
      return requireMatch(
        await store.update(
          actor.id,
          validateUuid(id, "Category identifier"),
          validateVersion(version),
          validateValues(input),
        ),
      );
    },
    async deactivate(actor: Principal, id: unknown, version: unknown, replacementId: unknown) {
      requireUserPrincipal(actor);
      const sourceId = validateUuid(id, "Category identifier");
      const replacement = validateReplacement(replacementId);
      if (replacement === sourceId) {
        throw new ProductCategoryValidationError("Replacement category must differ from the source");
      }
      if (!await store.deactivate(actor.id, sourceId, validateVersion(version), replacement)) {
        throw new ProductCategoryConflictError("Category mutation is unavailable");
      }
    },
  };
}

function hasDatabaseConflict(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error.code === "P2002" || error.code === "P2034");
}

export function createDatabaseProductCategoryStore(
  db: ReturnType<typeof getDatabaseClient>,
): ProductCategoryStore {
  return {
    list(ownerId) {
      return db.productCategory.findMany({
        where: { ownerId },
        orderBy: [{ active: "desc" }, { namePtBr: "asc" }, { id: "asc" }],
      });
    },
    async create(ownerId, values) {
      const now = new Date();
      try {
        return await db.productCategory.create({
          data: {
            id: randomUUID(),
            ownerId,
            ...values,
            active: true,
            version: 0,
            createdAt: now,
            updatedAt: now,
          },
        });
      } catch (error) {
        if (hasDatabaseConflict(error)) return null;
        throw error;
      }
    },
    async update(ownerId, id, version, values) {
      try {
        return await db.$transaction(async (transaction) => {
          const changed = await transaction.productCategory.updateMany({
            where: { id, ownerId, version, active: true },
            data: { ...values, version: { increment: 1 }, updatedAt: new Date() },
          });
          if (changed.count !== 1) return null;
          return transaction.productCategory.findFirst({ where: { id, ownerId } });
        }, { isolationLevel: "Serializable" });
      } catch (error) {
        if (hasDatabaseConflict(error)) return null;
        throw error;
      }
    },
    async deactivate(ownerId, id, version, replacementId) {
      try {
        return await db.$transaction(async (transaction) => {
          const categoryIds = replacementId === null ? [id] : [id, replacementId].sort();
          const categories = replacementId === null
            ? await transaction.$queryRawUnsafe<Array<{ id: string; active: boolean; version: number }>>(
              `SELECT id, active, version
               FROM app.product_category
               WHERE owner_id = $1::uuid AND id = $2::uuid
               ORDER BY id
               FOR UPDATE`,
              ownerId,
              categoryIds[0],
            )
            : await transaction.$queryRawUnsafe<Array<{ id: string; active: boolean; version: number }>>(
              `SELECT id, active, version
               FROM app.product_category
               WHERE owner_id = $1::uuid AND id IN ($2::uuid, $3::uuid)
               ORDER BY id
               FOR UPDATE`,
              ownerId,
              categoryIds[0],
              categoryIds[1],
            );

          const source = categories.find((category) => category.id === id);
          if (!source?.active || source.version !== version) return false;
          const replacement = replacementId === null
            ? null
            : categories.find((category) => category.id === replacementId);
          if (replacementId !== null && !replacement?.active) return false;

          const referencedProducts = await transaction.$queryRaw<Array<{ id: string }>>`
            SELECT id
            FROM app.product
            WHERE owner_id = ${ownerId}::uuid AND category_id = ${id}::uuid
            ORDER BY id
            FOR UPDATE
          `;
          if (referencedProducts.length > 0 && replacementId === null) return false;
          if (replacementId !== null) {
            await transaction.product.updateMany({
              where: { ownerId, categoryId: id },
              data: { categoryId: replacementId },
            });
          }
          const changed = await transaction.productCategory.updateMany({
            where: { id, ownerId, version, active: true },
            data: { active: false, version: { increment: 1 }, updatedAt: new Date() },
          });
          return changed.count === 1;
        }, { isolationLevel: "Serializable" });
      } catch (error) {
        if (hasDatabaseConflict(error)) return false;
        throw error;
      }
    },
  };
}

export function getProductCategoryService() {
  return createProductCategoryService(createDatabaseProductCategoryStore(getDatabaseClient()));
}
