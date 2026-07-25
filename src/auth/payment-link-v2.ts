import { randomBytes, randomUUID } from "node:crypto";

import { getDatabaseClient } from "../db/client";
import type { Prisma } from "../generated/prisma/client";
import { requireUserPrincipal, type Principal } from "./authorization";
import type { PaymentLinkType } from "./payment-link";

export const PAYMENT_LINK_V2_COMPOSITION_KINDS = ["PRODUCT_LINES", "FIXED_AMOUNT"] as const;
export type PaymentLinkV2CompositionKind = (typeof PAYMENT_LINK_V2_COMPOSITION_KINDS)[number];

export type PaymentLinkV2LineValues = Readonly<{
  productId: string;
  position: number;
  quantity: number;
}>;

export type OwnerPaymentLinkV2 = Readonly<{
  id: string;
  identifier: string;
  compositionKind: PaymentLinkV2CompositionKind;
  descriptionPtBr: string | null;
  descriptionEn: string | null;
  amount: string | null;
  currencyPairId: string;
  linkType: PaymentLinkType;
  expiresAt: Date | null;
  active: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  lines: ReadonlyArray<PaymentLinkV2LineValues>;
}>;

export type PaymentLinkV2CreateValues = Readonly<{
  identifier: string;
  compositionKind: PaymentLinkV2CompositionKind;
  descriptionPtBr: string | null;
  descriptionEn: string | null;
  amount: string | null;
  currencyPairId: string;
  linkType: PaymentLinkType;
  expiresAt: Date | null;
  lines: ReadonlyArray<PaymentLinkV2LineValues>;
}>;

// Financial edit carries the whole replacement composition for the link's
// immutable kind; expiry rides the same CAS but never triggers the attempt gate.
export type PaymentLinkV2EditValues = Readonly<{
  expiresAt: Date | null;
  financial: Readonly<{
    descriptionPtBr: string | null;
    descriptionEn: string | null;
    amount: string | null;
    lines: ReadonlyArray<PaymentLinkV2LineValues>;
  }> | null;
}>;

export class PaymentLinkV2ValidationError extends Error {}
export class PaymentLinkV2ConflictError extends Error {}
export class PaymentLinkV2DependencyError extends Error {}
export class PaymentLinkV2FinancialEditLockedError extends Error {}

export type PaymentLinkV2Store = {
  findOwned(ownerId: string, id: string): Promise<OwnerPaymentLinkV2 | null>;
  identifierTaken(identifier: string): Promise<boolean>;
  create(ownerId: string, values: PaymentLinkV2CreateValues & Readonly<{ id: string; createdAt: Date; updatedAt: Date }>): Promise<OwnerPaymentLinkV2 | "dependency-unavailable">;
  edit(ownerId: string, id: string, version: number, values: PaymentLinkV2EditValues & Readonly<{ updatedAt: Date }>): Promise<OwnerPaymentLinkV2 | "dependency-unavailable" | null>;
  setActive(ownerId: string, id: string, version: number, active: boolean, updatedAt: Date): Promise<OwnerPaymentLinkV2 | null>;
  // Wired by 8.1.3: observes the real checkout_attempt_v2 existence read; one
  // persisted attempt financially locks the link's composition.
  hasCheckoutAttempt(id: string): Promise<boolean>;
};

type Dependencies = Readonly<{
  randomBytes: (size: number) => Buffer;
  now: () => Date;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATETIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const VERSION_PATTERN = /^(?:0|[1-9][0-9]*)$/;
// Exactly the product-price grammar: canonical positive ASCII decimal, at most
// 12 integer and 6 fractional digits, never converted through Number.
const AMOUNT_PATTERN = /^(?:0\.[0-9]{0,5}[1-9]|[1-9][0-9]{0,11}(?:\.[0-9]{0,5}[1-9])?)$/;
const IDENTIFIER_ATTEMPTS = 3;
const MAX_DATABASE_INTEGER = 2_147_483_647;
const activeDependencies: Dependencies = { randomBytes, now: () => new Date() };

function validateUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new PaymentLinkV2ValidationError(`${label} must be a canonical UUID`);
  }
  return value.toLowerCase();
}

function validateVersion(value: unknown): number {
  if (typeof value === "number") {
    if (Number.isInteger(value) && value >= 0 && value <= MAX_DATABASE_INTEGER) return value;
    throw new PaymentLinkV2ValidationError("Payment-link version is invalid");
  }
  if (typeof value !== "string" || !VERSION_PATTERN.test(value)) {
    throw new PaymentLinkV2ValidationError("Payment-link version is invalid");
  }
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version > MAX_DATABASE_INTEGER) {
    throw new PaymentLinkV2ValidationError("Payment-link version is invalid");
  }
  return version;
}

function validateCompositionKind(value: unknown): PaymentLinkV2CompositionKind {
  if (value === "PRODUCT_LINES" || value === "FIXED_AMOUNT") return value;
  throw new PaymentLinkV2ValidationError("Payment-link composition kind is invalid");
}

function validateLinkType(value: unknown): PaymentLinkType {
  if (value === "SINGLE_USE" || value === "REUSABLE") return value;
  throw new PaymentLinkV2ValidationError("Payment-link type is invalid");
}

function validateExpiry(value: unknown, now: Date): Date | null {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value !== "string" || !DATETIME_LOCAL_PATTERN.test(value)) {
    throw new PaymentLinkV2ValidationError("Payment-link expiry is invalid");
  }
  const expiry = new Date(`${value}:00.000Z`);
  if (Number.isNaN(expiry.getTime()) || expiry.toISOString().slice(0, 16) !== value || expiry <= now) {
    throw new PaymentLinkV2ValidationError("Payment-link expiry is invalid");
  }
  return expiry;
}

function validateDescription(value: unknown, field: string): string {
  if (typeof value !== "string") throw new PaymentLinkV2ValidationError(`${field} is required`);
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new PaymentLinkV2ValidationError(`${field} is required`);
  if (/[\r\n]/.test(trimmed)) throw new PaymentLinkV2ValidationError(`${field} must be single-line`);
  if ([...trimmed].length > 160) throw new PaymentLinkV2ValidationError(`${field} is too long`);
  return trimmed;
}

function validateAmount(value: unknown): string {
  if (typeof value !== "string" || !AMOUNT_PATTERN.test(value)) {
    throw new PaymentLinkV2ValidationError("Amount must be a canonical positive decimal");
  }
  return value;
}

function validateQuantity(value: unknown): number {
  const quantity = typeof value === "number" ? value : typeof value === "string" && VERSION_PATTERN.test(value) ? Number(value) : Number.NaN;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9_999) {
    throw new PaymentLinkV2ValidationError("Line quantity is invalid");
  }
  return quantity;
}

function parseLines(value: unknown): ReadonlyArray<unknown> {
  if (typeof value !== "string") throw new PaymentLinkV2ValidationError("Payment-link lines are required");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new PaymentLinkV2ValidationError("Payment-link lines are invalid");
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 20) {
    throw new PaymentLinkV2ValidationError("Payment-link lines are invalid");
  }
  return parsed;
}

function validateLines(value: unknown): PaymentLinkV2LineValues[] {
  const parsed = parseLines(value);
  const seen = new Set<string>();
  return parsed.map((entry, index) => {
    const line = entry as Readonly<Record<string, unknown>>;
    const productId = validateUuid(line?.productId, "Line product identifier");
    if (seen.has(productId)) throw new PaymentLinkV2ValidationError("Line product appears twice");
    seen.add(productId);
    return { productId, position: index + 1, quantity: validateQuantity(line?.quantity) };
  });
}

function isIdentifierCollision(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") return false;
  const target = candidate.meta?.target;
  return Array.isArray(target)
    ? target.includes("payment_link_v2_identifier_key") || target.includes("identifier")
    : target === "payment_link_v2_identifier_key" || target === "identifier";
}

function fixedAmountComposition(input: Readonly<Record<string, unknown>>) {
  return {
    descriptionPtBr: validateDescription(input.descriptionPtBr, "Portuguese description"),
    descriptionEn: validateDescription(input.descriptionEn, "English description"),
    amount: validateAmount(input.amount),
    lines: [] as PaymentLinkV2LineValues[],
  };
}

function productLinesComposition(input: Readonly<Record<string, unknown>>) {
  return {
    descriptionPtBr: null,
    descriptionEn: null,
    amount: null,
    lines: validateLines(input.lines),
  };
}

export function createPaymentLinkV2Service(store: PaymentLinkV2Store, dependencies: Dependencies = activeDependencies) {
  return {
    async create(actor: Principal, input: Readonly<Record<string, unknown>>) {
      requireUserPrincipal(actor);
      const compositionKind = validateCompositionKind(input.compositionKind);
      const currencyPairId = validateUuid(input.currencyPairId, "Currency-pair identifier");
      const linkType = validateLinkType(input.linkType);
      const expiresAt = validateExpiry(input.expiresAt, dependencies.now());
      const composition = compositionKind === "FIXED_AMOUNT" ? fixedAmountComposition(input) : productLinesComposition(input);

      for (let attempt = 0; attempt < IDENTIFIER_ATTEMPTS; attempt += 1) {
        const identifier = dependencies.randomBytes(18).toString("base64url");
        // The identifier namespace is shared with V1; the store probes the V1
        // table while the V2 table enforces its own uniqueness on insert.
        if (await store.identifierTaken(identifier)) continue;
        const now = dependencies.now();
        let created: Awaited<ReturnType<PaymentLinkV2Store["create"]>>;
        try {
          created = await store.create(actor.id, {
            id: randomUUID(),
            identifier,
            compositionKind,
            currencyPairId,
            linkType,
            expiresAt,
            createdAt: now,
            updatedAt: now,
            ...composition,
          });
        } catch (error) {
          if (!isIdentifierCollision(error) || attempt === IDENTIFIER_ATTEMPTS - 1) break;
          continue;
        }
        if (created === "dependency-unavailable") {
          throw new PaymentLinkV2DependencyError("Payment-link dependency is unavailable");
        }
        return created;
      }
      throw new PaymentLinkV2ConflictError("Payment-link generation could not be completed");
    },
    async edit(actor: Principal, id: unknown, version: unknown, input: Readonly<Record<string, unknown>>) {
      requireUserPrincipal(actor);
      const linkId = validateUuid(id, "Payment-link identifier");
      const expectedVersion = validateVersion(version);
      const current = await store.findOwned(actor.id, linkId);
      if (!current) throw new PaymentLinkV2ConflictError("Payment-link mutation did not match the expected version");
      // Absent expiry keeps the stored value; an explicit blank clears it.
      const expiresAt = input.expiresAt === undefined ? current.expiresAt : validateExpiry(input.expiresAt, dependencies.now());

      let financial: PaymentLinkV2EditValues["financial"] = null;
      const hasFinancialInput = current.compositionKind === "FIXED_AMOUNT"
        ? input.descriptionPtBr != null || input.descriptionEn != null || input.amount != null
        : input.lines != null;
      if (hasFinancialInput) {
        if (await store.hasCheckoutAttempt(linkId)) {
          throw new PaymentLinkV2FinancialEditLockedError("Payment-link financial composition is locked by a checkout attempt");
        }
        financial = current.compositionKind === "FIXED_AMOUNT" ? fixedAmountComposition(input) : productLinesComposition(input);
      }

      const edited = await store.edit(actor.id, linkId, expectedVersion, { expiresAt, financial, updatedAt: dependencies.now() });
      if (edited === "dependency-unavailable") {
        throw new PaymentLinkV2DependencyError("Payment-link dependency is unavailable");
      }
      if (!edited) throw new PaymentLinkV2ConflictError("Payment-link mutation did not match the expected version");
      return edited;
    },
    async setActive(actor: Principal, id: unknown, version: unknown, active: unknown) {
      requireUserPrincipal(actor);
      if (active !== true && active !== false && active !== "true" && active !== "false") {
        throw new PaymentLinkV2ValidationError("Payment-link active state is invalid");
      }
      const linkId = validateUuid(id, "Payment-link identifier");
      const expectedVersion = validateVersion(version);
      const updated = await store.setActive(actor.id, linkId, expectedVersion, active === true || active === "true", dependencies.now());
      if (!updated) throw new PaymentLinkV2ConflictError("Payment-link mutation did not match the expected version");
      return updated;
    },
  };
}

const projection = {
  id: true,
  identifier: true,
  compositionKind: true,
  descriptionPtBr: true,
  descriptionEn: true,
  amount: true,
  currencyPairId: true,
  linkType: true,
  expiresAt: true,
  active: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  lines: { select: { productId: true, position: true, quantity: true }, orderBy: { position: "asc" } },
} as const;

type PrismaPaymentLinkV2 = Omit<OwnerPaymentLinkV2, "compositionKind" | "linkType"> & { compositionKind: string; linkType: string };

function toOwnerPaymentLinkV2(link: PrismaPaymentLinkV2): OwnerPaymentLinkV2 {
  return {
    ...link,
    compositionKind: link.compositionKind as PaymentLinkV2CompositionKind,
    linkType: link.linkType as PaymentLinkType,
  };
}

// Shared row locks serialize creation/edit with dependency deactivation inside
// one transaction: a deactivation committed first rejects the write, while a
// deactivation committed after it leaves the link intact. This replaces the V1
// commit-boundary trigger, which the safe migration language cannot extend.
async function pairActive(transaction: Prisma.TransactionClient, currencyPairId: string): Promise<boolean> {
  const pairs = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "app"."catalog_currency_pair"
    WHERE "id" = ${currencyPairId}::uuid AND "active" = true
    FOR SHARE
  `;
  return pairs.length === 1;
}

async function productsActive(
  transaction: Prisma.TransactionClient,
  ownerId: string,
  productIds: ReadonlyArray<string>,
): Promise<boolean> {
  for (const productId of new Set(productIds)) {
    const products = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "app"."product"
      WHERE "owner_id" = ${ownerId}::uuid AND "id" = ${productId}::uuid AND "active" = true
      FOR SHARE
    `;
    if (products.length !== 1) return false;
  }
  return true;
}

export function createPaymentLinkV2Store(db: ReturnType<typeof getDatabaseClient>): PaymentLinkV2Store {
  return {
    async findOwned(ownerId, id) {
      const link = await db.paymentLinkV2.findFirst({ where: { id, ownerId }, select: projection });
      return link ? toOwnerPaymentLinkV2(link) : null;
    },
    async identifierTaken(identifier) {
      const collisions = await Promise.all([
        db.paymentLink.count({ where: { identifier } }),
        db.paymentLinkV2.count({ where: { identifier } }),
      ]);
      return collisions.some((count) => count > 0);
    },
    async create(ownerId, values) {
      return db.$transaction(async (transaction) => {
        if (!(await pairActive(transaction, values.currencyPairId))
          || !(await productsActive(transaction, ownerId, values.lines.map((line) => line.productId)))) {
          return "dependency-unavailable";
        }
        await transaction.paymentLinkV2.create({
          data: {
            id: values.id,
            identifier: values.identifier,
            ownerId,
            compositionKind: values.compositionKind,
            descriptionPtBr: values.descriptionPtBr,
            descriptionEn: values.descriptionEn,
            amount: values.amount,
            currencyPairId: values.currencyPairId,
            linkType: values.linkType,
            expiresAt: values.expiresAt,
            active: true,
            version: 0,
            createdAt: values.createdAt,
            updatedAt: values.updatedAt,
          },
        });
        if (values.lines.length > 0) {
          await transaction.paymentLinkV2Line.createMany({
            data: values.lines.map((line) => ({
              paymentLinkV2Id: values.id,
              ownerId,
              productId: line.productId,
              position: line.position,
              quantity: line.quantity,
            })),
          });
        }
        const link = await transaction.paymentLinkV2.findFirst({ where: { id: values.id, ownerId }, select: projection });
        return link ? toOwnerPaymentLinkV2(link) : "dependency-unavailable";
      });
    },
    async edit(ownerId, id, version, values) {
      return db.$transaction(async (transaction) => {
        // The pair is immutable and never re-checked on edit; only newly
        // referenced products need the active same-owner verification.
        if (values.financial && values.financial.lines.length > 0
          && !(await productsActive(transaction, ownerId, values.financial.lines.map((line) => line.productId)))) {
          return "dependency-unavailable";
        }
        const updated = await transaction.paymentLinkV2.updateMany({
          where: { id, ownerId, version },
          data: {
            expiresAt: values.expiresAt,
            ...(values.financial
              ? {
                descriptionPtBr: values.financial.descriptionPtBr,
                descriptionEn: values.financial.descriptionEn,
                amount: values.financial.amount,
              }
              : {}),
            version: { increment: 1 },
            updatedAt: values.updatedAt,
          },
        });
        if (updated.count !== 1) return null;
        if (values.financial) {
          await transaction.paymentLinkV2Line.deleteMany({ where: { paymentLinkV2Id: id, ownerId } });
          if (values.financial.lines.length > 0) {
            await transaction.paymentLinkV2Line.createMany({
              data: values.financial.lines.map((line) => ({
                paymentLinkV2Id: id,
                ownerId,
                productId: line.productId,
                position: line.position,
                quantity: line.quantity,
              })),
            });
          }
        }
        const link = await transaction.paymentLinkV2.findFirst({ where: { id, ownerId }, select: projection });
        return link ? toOwnerPaymentLinkV2(link) : null;
      });
    },
    async setActive(ownerId, id, version, active, updatedAt) {
      const updated = await db.paymentLinkV2.updateMany({
        where: { id, ownerId, version },
        data: { active, version: { increment: 1 }, updatedAt },
      });
      if (updated.count !== 1) return null;
      const link = await db.paymentLinkV2.findFirst({ where: { id, ownerId }, select: projection });
      return link ? toOwnerPaymentLinkV2(link) : null;
    },
    // 8.1.3 wiring: the real attempt-existence read over checkout_attempt_v2,
    // queried by the link identity the financial-edit gate receives.
    async hasCheckoutAttempt(id) {
      const attempts = await db.checkoutAttemptV2.count({ where: { paymentLinkV2Id: id } });
      return attempts > 0;
    },
  };
}

export function getPaymentLinkV2Service() {
  return createPaymentLinkV2Service(createPaymentLinkV2Store(getDatabaseClient()));
}
