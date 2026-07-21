import { getDatabaseClient } from "../db/client";
import { ForbiddenError, type Principal } from "./authorization";

export type OwnerProduct = {
  id: string;
  internalName: string;
  titlePtBr: string;
  titleEn: string;
  descriptionPtBr: string;
  descriptionEn: string;
  price: string;
  active: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductValues = Pick<
  OwnerProduct,
  "internalName" | "titlePtBr" | "titleEn" | "descriptionPtBr" | "descriptionEn" | "price"
>;

export class ProductValidationError extends Error {}
export class ProductConflictError extends Error {}

export type ProductStore = {
  list(ownerId: string): Promise<OwnerProduct[]>;
  create(ownerId: string, values: ProductValues): Promise<OwnerProduct>;
  update(ownerId: string, id: string, version: number, values: ProductValues): Promise<OwnerProduct | null>;
  setActive(ownerId: string, id: string, version: number, active: boolean): Promise<OwnerProduct | null>;
  delete(ownerId: string, id: string, version: number): Promise<boolean>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRICE_PATTERN = /^(?:0\.[0-9]{0,5}[1-9]|[1-9][0-9]{0,11}(?:\.[0-9]{0,5}[1-9])?)$/;
const VERSION_PATTERN = /^(?:0|[1-9][0-9]*)$/;
const MAX_DATABASE_INTEGER = 2_147_483_647;

function requireActiveActor(actor: Principal) {
  if (actor.status !== "ACTIVE") {
    throw new ForbiddenError("Active account access is required");
  }
}

function validateUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ProductValidationError("Product identifier must be a canonical UUID");
  }
  return value.toLowerCase();
}

function validateVersion(value: unknown): number {
  if (typeof value === "number") {
    if (Number.isInteger(value) && value >= 0 && value <= MAX_DATABASE_INTEGER) return value;
    throw new ProductValidationError("Product version is invalid");
  }
  if (typeof value !== "string" || !VERSION_PATTERN.test(value)) {
    throw new ProductValidationError("Product version is invalid");
  }
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version > MAX_DATABASE_INTEGER) {
    throw new ProductValidationError("Product version is invalid");
  }
  return version;
}

function validateText(value: unknown, field: string, maximum: number, singleLine: boolean): string {
  if (typeof value !== "string") throw new ProductValidationError(`${field} is required`);
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new ProductValidationError(`${field} is required`);
  if (singleLine && /[\r\n]/.test(trimmed)) throw new ProductValidationError(`${field} must be single-line`);
  if ([...trimmed].length > maximum) throw new ProductValidationError(`${field} is too long`);
  return trimmed;
}

function validatePrice(value: unknown): string {
  if (typeof value !== "string" || !PRICE_PATTERN.test(value)) {
    throw new ProductValidationError("Price must be a canonical positive decimal");
  }
  return value;
}

function validateValues(input: Record<keyof ProductValues, unknown>): ProductValues {
  return {
    internalName: validateText(input.internalName, "Internal name", 128, true),
    titlePtBr: validateText(input.titlePtBr, "Portuguese title", 160, true),
    titleEn: validateText(input.titleEn, "English title", 160, true),
    descriptionPtBr: validateText(input.descriptionPtBr, "Portuguese description", 2_000, false),
    descriptionEn: validateText(input.descriptionEn, "English description", 2_000, false),
    price: validatePrice(input.price),
  };
}

function requireMatchedProduct(product: OwnerProduct | null): OwnerProduct {
  if (!product) throw new ProductConflictError("Product mutation did not match the expected version");
  return product;
}

export function createProductService(store: ProductStore) {
  return {
    async listForOwner(actor: Principal) {
      requireActiveActor(actor);
      return store.list(actor.id);
    },
    async create(actor: Principal, input: Record<keyof ProductValues, unknown>) {
      requireActiveActor(actor);
      return store.create(actor.id, validateValues(input));
    },
    async update(
      actor: Principal,
      id: unknown,
      version: unknown,
      input: Record<keyof ProductValues, unknown>,
    ) {
      requireActiveActor(actor);
      return requireMatchedProduct(
        await store.update(actor.id, validateUuid(id), validateVersion(version), validateValues(input)),
      );
    },
    async setActive(actor: Principal, id: unknown, version: unknown, active: unknown) {
      requireActiveActor(actor);
      if (active !== true && active !== false && active !== "true" && active !== "false") {
        throw new ProductValidationError("Product active state is invalid");
      }
      return requireMatchedProduct(
        await store.setActive(actor.id, validateUuid(id), validateVersion(version), active === true || active === "true"),
      );
    },
    async delete(actor: Principal, id: unknown, version: unknown) {
      requireActiveActor(actor);
      const deleted = await store.delete(actor.id, validateUuid(id), validateVersion(version));
      if (!deleted) throw new ProductConflictError("Product mutation did not match the expected version");
    },
  };
}

function prismaStore(): ProductStore {
  const db = getDatabaseClient();
  return {
    list(ownerId) {
      return db.product.findMany({ where: { ownerId }, orderBy: [{ internalName: "asc" }, { id: "asc" }] });
    },
    create(ownerId, values) {
      return db.product.create({ data: { ownerId, ...values } });
    },
    update(ownerId, id, version, values) {
      return db.$transaction(async (transaction) => {
        const result = await transaction.product.updateMany({
          where: { id, ownerId, version },
          data: { ...values, version: { increment: 1 } },
        });
        if (result.count !== 1) return null;
        return transaction.product.findFirst({ where: { id, ownerId } });
      });
    },
    setActive(ownerId, id, version, active) {
      return db.$transaction(async (transaction) => {
        const result = await transaction.product.updateMany({
          where: { id, ownerId, version },
          data: { active, version: { increment: 1 } },
        });
        if (result.count !== 1) return null;
        return transaction.product.findFirst({ where: { id, ownerId } });
      });
    },
    async delete(ownerId, id, version) {
      const result = await db.product.deleteMany({ where: { id, ownerId, version } });
      return result.count === 1;
    },
  };
}

export function getProductService() {
  return createProductService(prismaStore());
}
