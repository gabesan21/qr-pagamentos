import "server-only";

import { randomUUID } from "node:crypto";

import { requireUserPrincipal, type Principal } from "../auth/authorization";
import { getDatabaseClient } from "../db/client";
import type { PrismaClient } from "../generated/prisma/client";
import { ORDER_V2_LOCAL_OUTCOMES, type OrderV2LocalOutcome } from "./order-v2";

// Comment and local-outcome bodies share the same text rules: 1–2,000 Unicode
// code points, NFC, trimmed, internal line breaks preserved, and every control
// character other than a line break rejected. Outcome notes are nullable.
export type StoredOrderCommentV2 = Readonly<{
  id: string;
  orderId: string;
  ownerId: string;
  authorId: string;
  body: string;
  version: number;
  createdAt: Date;
  editedAt: Date | null;
}>;

export type StoredOrderLocalOutcomeV2 = Readonly<{
  id: string;
  orderId: string;
  ownerId: string;
  outcome: OrderV2LocalOutcome;
  note: string | null;
  actorId: string;
  createdAt: Date;
}>;

export class OrderCommentV2ValidationError extends Error {}
export class OrderLocalOutcomeV2ValidationError extends Error {}
export class OrderEngagementV2ConflictError extends Error {}

export type OrderCommentV2Store = Readonly<{
  append(ownerId: string, orderId: string, values: Readonly<{ id: string; authorId: string; body: string; createdAt: Date }>): Promise<StoredOrderCommentV2 | null>;
  editByAuthor(ownerId: string, commentId: string, version: number, values: Readonly<{ body: string; editedAt: Date }>): Promise<StoredOrderCommentV2 | null>;
}>;

export type OrderLocalOutcomeV2Store = Readonly<{
  append(ownerId: string, orderId: string, expectedLifecycleVersion: number, values: Readonly<{ id: string; outcome: OrderV2LocalOutcome; note: string | null; actorId: string; createdAt: Date; updatedAt: Date }>): Promise<StoredOrderLocalOutcomeV2 | null>;
}>;

type Dependencies = Readonly<{
  now: () => Date;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION_PATTERN = /^(?:0|[1-9][0-9]*)$/;
const UNICODE_WHITESPACE = " \\t\\n\\r\\f\\v\\u00a0\\u1680\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff";
// Line breaks survive; every other C0/C1 control character is rejected.
const CONTROL_EXCEPT_LF_PATTERN = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u;
const MAX_DATABASE_INTEGER = 2_147_483_647;
const activeDependencies: Dependencies = { now: () => new Date() };

function validateOrderId(value: unknown, ErrorClass: typeof OrderCommentV2ValidationError | typeof OrderLocalOutcomeV2ValidationError): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ErrorClass("Order identity is invalid");
  }
  return value.toLowerCase();
}

function validateVersion(value: unknown, ErrorClass: typeof OrderCommentV2ValidationError | typeof OrderLocalOutcomeV2ValidationError): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_DATABASE_INTEGER) return value;
  if (typeof value !== "string" || !VERSION_PATTERN.test(value)) throw new ErrorClass("Expected version is invalid");
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version > MAX_DATABASE_INTEGER) throw new ErrorClass("Expected version is invalid");
  return version;
}

function normalizeBody(value: unknown, ErrorClass: typeof OrderCommentV2ValidationError | typeof OrderLocalOutcomeV2ValidationError, label: string): string {
  if (typeof value !== "string") throw new ErrorClass(`${label} is required`);
  const normalized = value
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(new RegExp(`^[${UNICODE_WHITESPACE}]+|[${UNICODE_WHITESPACE}]+$`, "gu"), "");
  const length = [...normalized].length;
  if (length < 1 || length > 2_000 || CONTROL_EXCEPT_LF_PATTERN.test(normalized)) {
    throw new ErrorClass(`${label} is invalid`);
  }
  return normalized;
}

function requireUpdated<T>(updated: T | null): T {
  if (!updated) throw new OrderEngagementV2ConflictError("Order engagement mutation did not match the expected version");
  return updated;
}

export function createOrderCommentV2Service(store: OrderCommentV2Store, dependencies: Dependencies = activeDependencies) {
  return {
    // The author is always the order owner; administrators and customers never
    // comment. Cross-owner or missing orders share the opaque conflict outcome.
    async append(actor: Principal, orderId: unknown, body: unknown): Promise<StoredOrderCommentV2> {
      requireUserPrincipal(actor);
      const id = validateOrderId(orderId, OrderCommentV2ValidationError);
      const text = normalizeBody(body, OrderCommentV2ValidationError, "Comment body");
      const created = await store.append(actor.id, id, { id: randomUUID(), authorId: actor.id, body: text, createdAt: dependencies.now() });
      return requireUpdated(created);
    },
    async edit(actor: Principal, commentId: unknown, version: unknown, body: unknown): Promise<StoredOrderCommentV2> {
      requireUserPrincipal(actor);
      const id = validateOrderId(commentId, OrderCommentV2ValidationError);
      const expectedVersion = validateVersion(version, OrderCommentV2ValidationError);
      const text = normalizeBody(body, OrderCommentV2ValidationError, "Comment body");
      const edited = await store.editByAuthor(actor.id, id, expectedVersion, { body: text, editedAt: dependencies.now() });
      return requireUpdated(edited);
    },
  };
}

export function createOrderLocalOutcomeV2Service(store: OrderLocalOutcomeV2Store, dependencies: Dependencies = activeDependencies) {
  return {
    // Append-only history under CAS on the order's lifecycle version; the
    // latest entry is current and `state` is never a parameter here.
    async append(actor: Principal, orderId: unknown, version: unknown, outcome: unknown, note: unknown): Promise<StoredOrderLocalOutcomeV2> {
      requireUserPrincipal(actor);
      const id = validateOrderId(orderId, OrderLocalOutcomeV2ValidationError);
      const expectedVersion = validateVersion(version, OrderLocalOutcomeV2ValidationError);
      if (typeof outcome !== "string" || !(ORDER_V2_LOCAL_OUTCOMES as readonly string[]).includes(outcome)) {
        throw new OrderLocalOutcomeV2ValidationError("Local outcome is invalid");
      }
      const text = note === undefined || note === null || note === ""
        ? null
        : normalizeBody(note, OrderLocalOutcomeV2ValidationError, "Outcome note");
      const now = dependencies.now();
      const appended = await store.append(actor.id, id, expectedVersion, { id: randomUUID(), outcome: outcome as OrderV2LocalOutcome, note: text, actorId: actor.id, createdAt: now, updatedAt: now });
      return requireUpdated(appended);
    },
  };
}

const commentSelect = { id: true, orderId: true, ownerId: true, authorId: true, body: true, version: true, createdAt: true, editedAt: true } as const;
const outcomeSelect = { id: true, orderId: true, ownerId: true, outcome: true, note: true, actorId: true, createdAt: true } as const;

export function createOrderCommentV2Store(prisma: PrismaClient): OrderCommentV2Store {
  return {
    async append(ownerId, orderId, values) {
      const order = await prisma.orderV2.findFirst({ where: { id: orderId, ownerId }, select: { id: true } });
      if (!order) return null;
      return prisma.orderCommentV2.create({
        data: { id: values.id, orderId, ownerId, authorId: values.authorId, body: values.body, version: 0, createdAt: values.createdAt, editedAt: null },
        select: commentSelect,
      });
    },
    async editByAuthor(ownerId, commentId, version, values) {
      const updated = await prisma.orderCommentV2.updateMany({
        where: { id: commentId, ownerId, authorId: ownerId, version },
        data: { body: values.body, editedAt: values.editedAt, version: { increment: 1 } },
      });
      if (updated.count !== 1) return null;
      return prisma.orderCommentV2.findFirst({ where: { id: commentId, ownerId }, select: commentSelect });
    },
  };
}

export function createOrderLocalOutcomeV2Store(prisma: PrismaClient): OrderLocalOutcomeV2Store {
  return {
    async append(ownerId, orderId, expectedLifecycleVersion, values) {
      return prisma.$transaction(async (tx) => {
        // CAS on the order's lifecycle version serializes concurrent appends;
        // the bump touches only lifecycle_version/updated_at, never `state`.
        const claimed = await tx.orderV2.updateMany({
          where: { id: orderId, ownerId, lifecycleVersion: expectedLifecycleVersion },
          data: { lifecycleVersion: { increment: 1 }, updatedAt: values.updatedAt },
        });
        if (claimed.count !== 1) return null;
        return tx.orderLocalOutcomeV2.create({
          data: { id: values.id, orderId, ownerId, outcome: values.outcome, note: values.note, actorId: values.actorId, createdAt: values.createdAt },
          select: outcomeSelect,
        });
      });
    },
  };
}

export function getOrderCommentV2Service() {
  return createOrderCommentV2Service(createOrderCommentV2Store(getDatabaseClient()));
}

export function getOrderLocalOutcomeV2Service() {
  return createOrderLocalOutcomeV2Service(createOrderLocalOutcomeV2Store(getDatabaseClient()));
}
