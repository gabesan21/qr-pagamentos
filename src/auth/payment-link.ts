import { randomBytes } from "node:crypto";

import { getDatabaseClient } from "../db/client";
import { requireUserPrincipal, type Principal } from "./authorization";

export const PAYMENT_LINK_TYPES = ["SINGLE_USE", "REUSABLE"] as const;
export type PaymentLinkType = (typeof PAYMENT_LINK_TYPES)[number];

export type PaymentLinkProduct = Readonly<{
  id: string;
  internalName: string;
  titlePtBr: string;
  titleEn: string;
  price: string;
}>;
export type PaymentLinkCurrencyPair = Readonly<{ id: string; label: string }>;
export type OwnerPaymentLink = Readonly<{
  id: string;
  identifier: string;
  linkType: PaymentLinkType;
  expiresAt: Date | null;
  active: boolean;
  createdAt: Date;
  product: PaymentLinkProduct;
  currencyPair: PaymentLinkCurrencyPair;
}>;
export type PaymentLinkOwnerData = Readonly<{
  links: OwnerPaymentLink[];
  activeProducts: PaymentLinkProduct[];
  activeCurrencyPairs: PaymentLinkCurrencyPair[];
}>;
export type PaymentLinkCreateValues = Readonly<{
  identifier: string;
  productId: string;
  currencyPairId: string;
  linkType: PaymentLinkType;
  expiresAt: Date | null;
  active: true;
}>;

export class PaymentLinkValidationError extends Error {}
export class PaymentLinkConflictError extends Error {}
export class PaymentLinkDependencyError extends Error {}

export type PaymentLinkStore = {
  list(ownerId: string): Promise<OwnerPaymentLink[]>;
  listActiveProducts(ownerId: string): Promise<PaymentLinkProduct[]>;
  listActiveCurrencyPairs(): Promise<PaymentLinkCurrencyPair[]>;
  create(ownerId: string, values: PaymentLinkCreateValues): Promise<OwnerPaymentLink>;
  deactivate(ownerId: string, id: string): Promise<boolean>;
};

type Dependencies = Readonly<{
  randomBytes: (size: number) => Buffer;
  now: () => Date;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATETIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const IDENTIFIER_ATTEMPTS = 3;
const ACTIVE_DEPENDENCY_DATABASE_ERRORS = new Set([
  "ERROR: constraint payment_link_product_active",
  "ERROR: constraint payment_link_currency_pair_active",
]);
const activeDependencies: Dependencies = { randomBytes, now: () => new Date() };

function validateUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new PaymentLinkValidationError(`${label} must be a canonical UUID`);
  }
  return value.toLowerCase();
}

function validateType(value: unknown): PaymentLinkType {
  if (value === "SINGLE_USE" || value === "REUSABLE") return value;
  throw new PaymentLinkValidationError("Payment-link type is invalid");
}

function validateExpiry(value: unknown, now: Date): Date | null {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value !== "string" || !DATETIME_LOCAL_PATTERN.test(value)) {
    throw new PaymentLinkValidationError("Payment-link expiry is invalid");
  }
  const expiry = new Date(`${value}:00.000Z`);
  if (Number.isNaN(expiry.getTime()) || expiry.toISOString().slice(0, 16) !== value || expiry <= now) {
    throw new PaymentLinkValidationError("Payment-link expiry is invalid");
  }
  return expiry;
}

function isIdentifierCollision(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") return false;
  const target = candidate.meta?.target;
  return Array.isArray(target)
    ? target.includes("payment_link_identifier_key") || target.includes("identifier")
    : target === "payment_link_identifier_key" || target === "identifier";
}

function isInactiveDependency(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; meta?: { database_error?: unknown } };
  if (candidate.code !== "P2004" || typeof candidate.meta?.database_error !== "string") return false;
  return ACTIVE_DEPENDENCY_DATABASE_ERRORS.has(candidate.meta.database_error);
}

export function createPaymentLinkService(store: PaymentLinkStore, dependencies: Dependencies = activeDependencies) {
  return {
    async listForOwner(actor: Principal): Promise<PaymentLinkOwnerData> {
      requireUserPrincipal(actor);
      const [links, activeProducts, activeCurrencyPairs] = await Promise.all([
        store.list(actor.id),
        store.listActiveProducts(actor.id),
        store.listActiveCurrencyPairs(),
      ]);
      return { links, activeProducts, activeCurrencyPairs };
    },
    async create(actor: Principal, input: Readonly<Record<string, unknown>>) {
      requireUserPrincipal(actor);
      const productId = validateUuid(input.productId, "Product identifier");
      const currencyPairId = validateUuid(input.currencyPairId, "Currency-pair identifier");
      const linkType = validateType(input.linkType);
      const expiresAt = validateExpiry(input.expiresAt, dependencies.now());

      for (let attempt = 0; attempt < IDENTIFIER_ATTEMPTS; attempt += 1) {
        const identifier = dependencies.randomBytes(18).toString("base64url");
        try {
          return await store.create(actor.id, { identifier, productId, currencyPairId, linkType, expiresAt, active: true });
        } catch (error) {
          if (isInactiveDependency(error)) throw new PaymentLinkDependencyError("Payment-link dependency is unavailable");
          if (!isIdentifierCollision(error) || attempt === IDENTIFIER_ATTEMPTS - 1) break;
        }
      }
      throw new PaymentLinkConflictError("Payment-link generation could not be completed");
    },
    async deactivate(actor: Principal, id: unknown) {
      requireUserPrincipal(actor);
      const changed = await store.deactivate(actor.id, validateUuid(id, "Payment-link identifier"));
      if (!changed) throw new PaymentLinkConflictError("Payment-link revocation could not be completed");
    },
  };
}

function prismaStore(): PaymentLinkStore {
  const db = getDatabaseClient();
  const projection = {
    id: true,
    identifier: true,
    linkType: true,
    expiresAt: true,
    active: true,
    createdAt: true,
    product: { select: { id: true, internalName: true, titlePtBr: true, titleEn: true, price: true } },
    currencyPair: { select: { id: true, label: true } },
  } as const;
  type PrismaOwnerPaymentLink = Omit<OwnerPaymentLink, "linkType"> & { linkType: string };
  function toOwnerPaymentLink(link: PrismaOwnerPaymentLink): OwnerPaymentLink {
    return { ...link, linkType: link.linkType as PaymentLinkType };
  }
  return {
    async list(ownerId) {
      const links = await db.paymentLink.findMany({ where: { ownerId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: projection });
      return links.map(toOwnerPaymentLink);
    },
    listActiveProducts(ownerId) {
      return db.product.findMany({
        where: { ownerId, active: true },
        orderBy: [{ internalName: "asc" }, { id: "asc" }],
        select: { id: true, internalName: true, titlePtBr: true, titleEn: true, price: true },
      });
    },
    listActiveCurrencyPairs() {
      return db.catalogCurrencyPair.findMany({
        where: { active: true },
        orderBy: [{ label: "asc" }, { id: "asc" }],
        select: { id: true, label: true },
      });
    },
    async create(ownerId, values) {
      return toOwnerPaymentLink(await db.paymentLink.create({ data: { ownerId, ...values }, select: projection }));
    },
    async deactivate(ownerId, id) {
      const result = await db.paymentLink.updateMany({ where: { id, ownerId, active: true }, data: { active: false } });
      return result.count === 1;
    },
  };
}

export function getPaymentLinkService() {
  return createPaymentLinkService(prismaStore());
}
