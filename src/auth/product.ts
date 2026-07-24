import { getDatabaseClient } from "../db/client";
import type { Prisma } from "../generated/prisma/client";
import { getMediaService } from "../media/media-service";
import { MEDIA_IDENTIFIER_PATTERN } from "../media/types";
import { requireUserPrincipal, type Principal } from "./authorization";
import { getSupportedExchangeCurrencyService } from "./supported-exchange-currency";

export type OwnerProduct = {
  id: string;
  internalName: string;
  titlePtBr: string;
  titleEn: string;
  descriptionPtBr: string;
  descriptionEn: string;
  price: string;
  active: boolean;
  categoryId: string | null;
  currencyCode: string | null;
  imageMediaId: string | null;
  archivedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductValues = Pick<
  OwnerProduct,
  "internalName" | "titlePtBr" | "titleEn" | "descriptionPtBr" | "descriptionEn" | "price"
>;

export type ProductCatalogValues = Pick<OwnerProduct, "categoryId" | "currencyCode" | "imageMediaId">;

// Catalog-media fields follow patch semantics on input: absent (undefined)
// leaves the stored value unchanged, while explicit null or blank clears it.
export type ProductCatalogInput = Partial<Record<keyof ProductCatalogValues, unknown>>;

export class ProductValidationError extends Error {}
export class ProductConflictError extends Error {}

export type ProductStore = {
  list(ownerId: string): Promise<OwnerProduct[]>;
  findOwned(ownerId: string, id: string): Promise<OwnerProduct | null>;
  create(ownerId: string, values: ProductValues & ProductCatalogValues): Promise<OwnerProduct | null>;
  update(
    ownerId: string,
    id: string,
    version: number,
    values: ProductValues & ProductCatalogValues,
  ): Promise<OwnerProduct | null>;
  setActive(ownerId: string, id: string, version: number, active: boolean): Promise<OwnerProduct | null>;
  archive(ownerId: string, id: string, version: number, archivedAt: Date): Promise<OwnerProduct | null>;
  delete(ownerId: string, id: string, version: number): Promise<boolean>;
};

// Narrow ports so the currency registry and the media revision fence stay
// owned by their own services; this module only orchestrates them.
export type ProductDeps = Readonly<{
  requireActiveCurrencyPair(code: string): Promise<unknown>;
  activateOwnedProductImage(actor: Principal, identifier: string): Promise<unknown>;
  orphanOwnedProductImage(actor: Principal, identifier: string): Promise<unknown>;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRICE_PATTERN = /^(?:0\.[0-9]{0,5}[1-9]|[1-9][0-9]{0,11}(?:\.[0-9]{0,5}[1-9])?)$/;
const VERSION_PATTERN = /^(?:0|[1-9][0-9]*)$/;
const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;
const MAX_DATABASE_INTEGER = 2_147_483_647;

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

function validateNullableUuid(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ProductValidationError(`${field} must be a canonical UUID`);
  }
  return value.toLowerCase();
}

function validateCurrencyCode(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !CURRENCY_CODE_PATTERN.test(value)) {
    throw new ProductValidationError("Product currency must be an uppercase ISO 4217 alphabetic code");
  }
  return value;
}

function validateImageMediaId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !MEDIA_IDENTIFIER_PATTERN.test(value)) {
    throw new ProductValidationError("Product image is invalid");
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

function validateCatalogPatch(input: ProductCatalogInput): Partial<ProductCatalogValues> {
  const patch: Partial<ProductCatalogValues> = {};
  if (input.categoryId !== undefined) patch.categoryId = validateNullableUuid(input.categoryId, "Category identifier");
  if (input.currencyCode !== undefined) patch.currencyCode = validateCurrencyCode(input.currencyCode);
  if (input.imageMediaId !== undefined) patch.imageMediaId = validateImageMediaId(input.imageMediaId);
  return patch;
}

function requireMatchedProduct(product: OwnerProduct | null): OwnerProduct {
  if (!product) throw new ProductConflictError("Product mutation did not match the expected version");
  return product;
}

const unconfiguredDeps: ProductDeps = {
  requireActiveCurrencyPair() {
    throw new ProductValidationError("Product currency is unavailable");
  },
  activateOwnedProductImage() {
    throw new ProductValidationError("Product image is unavailable");
  },
  orphanOwnedProductImage() {
    throw new ProductValidationError("Product image is unavailable");
  },
};

async function compensateActivatedImage(
  deps: ProductDeps,
  actor: Principal,
  imageChanged: boolean,
  identifier: string | null,
) {
  // Compensate the just-activated image so a failed save never leaves an
  // ACTIVE object the row does not reference; worst case is a quota-counted
  // ACTIVE object, never a broken reference.
  if (!imageChanged || identifier === null) return;
  try {
    await deps.orphanOwnedProductImage(actor, identifier);
  } catch {
    // Best effort: the unreferenced ACTIVE object stays quota-counted.
  }
}

export function createProductService(store: ProductStore, deps: ProductDeps = unconfiguredDeps) {
  async function saveWithImageLifecycle(
    actor: Principal,
    save: () => Promise<OwnerProduct | null>,
    imageChanged: boolean,
    previousImage: string | null,
    nextImage: string | null,
  ): Promise<OwnerProduct> {
    if (imageChanged && nextImage !== null) {
      await deps.activateOwnedProductImage(actor, nextImage);
    }
    let saved: OwnerProduct;
    try {
      saved = requireMatchedProduct(await save());
    } catch (error) {
      await compensateActivatedImage(deps, actor, imageChanged, nextImage);
      throw error;
    }
    if (imageChanged && previousImage !== null) {
      await deps.orphanOwnedProductImage(actor, previousImage);
    }
    return saved;
  }

  return {
    async listForOwner(actor: Principal) {
      requireUserPrincipal(actor);
      return store.list(actor.id);
    },
    async create(actor: Principal, input: Record<keyof ProductValues, unknown> & ProductCatalogInput) {
      requireUserPrincipal(actor);
      const values = validateValues(input);
      const patch = validateCatalogPatch(input);
      const catalog: ProductCatalogValues = {
        categoryId: patch.categoryId ?? null,
        currencyCode: patch.currencyCode ?? null,
        imageMediaId: patch.imageMediaId ?? null,
      };
      if (catalog.currencyCode !== null) await deps.requireActiveCurrencyPair(catalog.currencyCode);
      return saveWithImageLifecycle(
        actor,
        () => store.create(actor.id, { ...values, ...catalog }),
        catalog.imageMediaId !== null,
        null,
        catalog.imageMediaId,
      );
    },
    async update(
      actor: Principal,
      id: unknown,
      version: unknown,
      input: Record<keyof ProductValues, unknown> & ProductCatalogInput,
    ) {
      requireUserPrincipal(actor);
      const productId = validateUuid(id);
      const expectedVersion = validateVersion(version);
      const values = validateValues(input);
      const patch = validateCatalogPatch(input);
      const current = await store.findOwned(actor.id, productId);
      if (!current || current.archivedAt !== null) {
        throw new ProductConflictError("Product mutation did not match the expected version");
      }
      const catalog: ProductCatalogValues = {
        categoryId: patch.categoryId !== undefined ? patch.categoryId : current.categoryId,
        currencyCode: patch.currencyCode !== undefined ? patch.currencyCode : current.currencyCode,
        imageMediaId: patch.imageMediaId !== undefined ? patch.imageMediaId : current.imageMediaId,
      };
      // Only a genuinely new currency assignment gates on the registry; a
      // stored code keeps reading as-is after a later mapping deactivation,
      // and clearing never requires a mapping.
      if (
        patch.currencyCode !== undefined
        && catalog.currencyCode !== null
        && catalog.currencyCode !== current.currencyCode
      ) {
        await deps.requireActiveCurrencyPair(catalog.currencyCode);
      }
      const imageChanged = patch.imageMediaId !== undefined && catalog.imageMediaId !== current.imageMediaId;
      return saveWithImageLifecycle(
        actor,
        () => store.update(actor.id, productId, expectedVersion, { ...values, ...catalog }),
        imageChanged,
        current.imageMediaId,
        catalog.imageMediaId,
      );
    },
    async setActive(actor: Principal, id: unknown, version: unknown, active: unknown) {
      requireUserPrincipal(actor);
      if (active !== true && active !== false && active !== "true" && active !== "false") {
        throw new ProductValidationError("Product active state is invalid");
      }
      return requireMatchedProduct(
        await store.setActive(actor.id, validateUuid(id), validateVersion(version), active === true || active === "true"),
      );
    },
    async archive(actor: Principal, id: unknown, version: unknown) {
      requireUserPrincipal(actor);
      return requireMatchedProduct(
        await store.archive(actor.id, validateUuid(id), validateVersion(version), new Date()),
      );
    },
    async delete(actor: Principal, id: unknown, version: unknown) {
      requireUserPrincipal(actor);
      const deleted = await store.delete(actor.id, validateUuid(id), validateVersion(version));
      if (!deleted) throw new ProductConflictError("Product mutation did not match the expected version");
    },
  };
}

async function categoryAssignable(
  transaction: Prisma.TransactionClient,
  ownerId: string,
  categoryId: string,
): Promise<boolean> {
  return (await transaction.productCategory.count({ where: { id: categoryId, ownerId, active: true } })) === 1;
}

function prismaStore(): ProductStore {
  const db = getDatabaseClient();
  return {
    list(ownerId) {
      return db.product.findMany({ where: { ownerId }, orderBy: [{ internalName: "asc" }, { id: "asc" }] });
    },
    findOwned(ownerId, id) {
      return db.product.findFirst({ where: { id, ownerId } });
    },
    create(ownerId, values) {
      return db.$transaction(async (transaction) => {
        if (values.categoryId !== null && !(await categoryAssignable(transaction, ownerId, values.categoryId))) {
          return null;
        }
        return transaction.product.create({ data: { ownerId, ...values } });
      });
    },
    update(ownerId, id, version, values) {
      return db.$transaction(async (transaction) => {
        if (values.categoryId !== null && !(await categoryAssignable(transaction, ownerId, values.categoryId))) {
          return null;
        }
        const result = await transaction.product.updateMany({
          where: { id, ownerId, version, archivedAt: null },
          data: { ...values, version: { increment: 1 } },
        });
        if (result.count !== 1) return null;
        return transaction.product.findFirst({ where: { id, ownerId } });
      });
    },
    setActive(ownerId, id, version, active) {
      return db.$transaction(async (transaction) => {
        const result = await transaction.product.updateMany({
          where: { id, ownerId, version, archivedAt: null },
          data: { active, version: { increment: 1 } },
        });
        if (result.count !== 1) return null;
        return transaction.product.findFirst({ where: { id, ownerId } });
      });
    },
    archive(ownerId, id, version, archivedAt) {
      return db.$transaction(async (transaction) => {
        const result = await transaction.product.updateMany({
          where: { id, ownerId, version, archivedAt: null },
          data: { active: false, archivedAt, version: { increment: 1 } },
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
  const media = getMediaService();
  const registry = getSupportedExchangeCurrencyService();
  return createProductService(prismaStore(), {
    requireActiveCurrencyPair: (code) => registry.requireActivePair(code),
    activateOwnedProductImage: (actor, identifier) => media.activateOwned(actor, identifier, "PRODUCT_IMAGE"),
    orphanOwnedProductImage: (actor, identifier) => media.orphanOwned(actor, identifier, "PRODUCT_IMAGE"),
  });
}
