import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ForbiddenError } from "../auth/authorization";
import type { PrismaClient } from "../generated/prisma/client";
import {
  OrderCommentV2ValidationError,
  OrderEngagementV2ConflictError,
  OrderLocalOutcomeV2ValidationError,
  createOrderCommentV2Service,
  createOrderLocalOutcomeV2Service,
  createOrderLocalOutcomeV2Store,
  type OrderCommentV2Store,
  type OrderLocalOutcomeV2Store,
  type StoredOrderCommentV2,
  type StoredOrderLocalOutcomeV2,
} from "./order-engagement-v2";

const ownerId = "110e8400-e29b-41d4-a716-446655440011";
const orderId = "440e8400-e29b-41d4-a716-446655440044";
const commentId = "550e8400-e29b-41d4-a716-446655440055";

const actor = { id: ownerId, username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const admin = { ...actor, role: "ADMIN" as const };

const comment: StoredOrderCommentV2 = {
  id: commentId,
  orderId,
  ownerId,
  authorId: ownerId,
  body: "First note",
  version: 0,
  createdAt: new Date("2026-07-25T12:00:00.000Z"),
  editedAt: null,
};

const outcome: StoredOrderLocalOutcomeV2 = {
  id: "660e8400-e29b-41d4-a716-446655440066",
  orderId,
  ownerId,
  outcome: "LOCAL_FINALIZED",
  note: null,
  actorId: ownerId,
  createdAt: new Date("2026-07-25T12:00:00.000Z"),
};

describe("order-comment-v2 service", () => {
  it("appends an owner comment with normalization preserving internal line breaks", async () => {
    const store: OrderCommentV2Store = { append: vi.fn(async () => comment), editByAuthor: vi.fn(async () => null) };
    const service = createOrderCommentV2Service(store);

    const created = await service.append(actor, orderId.toUpperCase(), "  Linha um\r\nLinha dois\u0007  ".replace("\u0007", ""));
    expect(created).toBe(comment);
    expect(store.append).toHaveBeenCalledWith(ownerId, orderId, expect.objectContaining({
      authorId: ownerId,
      body: "Linha um\nLinha dois",
    }));
  });

  it.each([
    ["blank body", ""],
    ["overlong body", "x".repeat(2001)],
    ["control character other than line break", "bad\u0007body"],
  ])("rejects a comment with %s", async (_label, body) => {
    const store: OrderCommentV2Store = { append: vi.fn(async () => comment), editByAuthor: vi.fn(async () => null) };
    const service = createOrderCommentV2Service(store);
    await expect(service.append(actor, orderId, body)).rejects.toBeInstanceOf(OrderCommentV2ValidationError);
    expect(store.append).not.toHaveBeenCalled();
  });

  it("rejects a malformed order identity without touching the store", async () => {
    const store: OrderCommentV2Store = { append: vi.fn(async () => comment), editByAuthor: vi.fn(async () => null) };
    const service = createOrderCommentV2Service(store);
    await expect(service.append(actor, "g40e8400-e29b-41d4-a716-446655440044", "ok")).rejects.toBeInstanceOf(OrderCommentV2ValidationError);
    expect(store.append).not.toHaveBeenCalled();
  });

  it("requires an active merchant principal for both append and edit", async () => {
    const store: OrderCommentV2Store = { append: vi.fn(async () => comment), editByAuthor: vi.fn(async () => comment) };
    const service = createOrderCommentV2Service(store);
    await expect(service.append(admin, orderId, "text")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.edit(admin, commentId, 0, "text")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("edits only through author-scoped expected-version CAS and stamps the edit", async () => {
    const edited = { ...comment, body: "Revised", version: 1, editedAt: new Date() };
    const store: OrderCommentV2Store = { append: vi.fn(async () => comment), editByAuthor: vi.fn(async () => edited) };
    const service = createOrderCommentV2Service(store);

    expect(await service.edit(actor, commentId, "0", "Revised")).toBe(edited);
    expect(store.editByAuthor).toHaveBeenCalledWith(ownerId, commentId, 0, expect.objectContaining({ body: "Revised", editedAt: expect.any(Date) }));
  });

  it("maps a lost CAS, cross-owner, or missing comment to the opaque conflict", async () => {
    const store: OrderCommentV2Store = { append: vi.fn(async () => comment), editByAuthor: vi.fn(async () => null) };
    const service = createOrderCommentV2Service(store);
    await expect(service.edit(actor, commentId, 7, "Revised")).rejects.toBeInstanceOf(OrderEngagementV2ConflictError);
    await expect(service.edit(actor, commentId, "v1", "Revised")).rejects.toBeInstanceOf(OrderCommentV2ValidationError);
  });

  it("maps a missing or cross-owner order on append to the opaque conflict", async () => {
    const store: OrderCommentV2Store = { append: vi.fn(async () => null), editByAuthor: vi.fn(async () => null) };
    const service = createOrderCommentV2Service(store);
    await expect(service.append(actor, orderId, "text")).rejects.toBeInstanceOf(OrderEngagementV2ConflictError);
  });

  it("scopes the append to the actor's owner identity and rejects a foreign order", async () => {
    const otherOwner = { ...actor, id: "220e8400-e29b-41d4-a716-446655440022" };
    const store: OrderCommentV2Store = {
      append: vi.fn(async (ownerId, id) => (ownerId === actor.id && id === orderId ? comment : null)),
      editByAuthor: vi.fn(async () => null),
    };
    const service = createOrderCommentV2Service(store);
    await expect(service.append(actor, orderId, "text")).resolves.toBe(comment);
    await expect(service.append(otherOwner, orderId, "text")).rejects.toBeInstanceOf(OrderEngagementV2ConflictError);
  });
});

describe("order-local-outcome-v2 service", () => {
  function storeWith(append: OrderLocalOutcomeV2Store["append"]): OrderLocalOutcomeV2Store {
    return { append: vi.fn(append) };
  }

  it("appends LOCAL_FINALIZED with a null note for blank input", async () => {
    const store = storeWith(async () => outcome);
    const service = createOrderLocalOutcomeV2Service(store);

    expect(await service.append(actor, orderId, 5, "LOCAL_FINALIZED", "")).toBe(outcome);
    expect(store.append).toHaveBeenCalledWith(ownerId, orderId, 5, expect.objectContaining({
      outcome: "LOCAL_FINALIZED",
      note: null,
      actorId: ownerId,
    }));
  });

  it("appends LOCAL_CANCELLED with a normalized note", async () => {
    const store = storeWith(async () => ({ ...outcome, outcome: "LOCAL_CANCELLED", note: "Cliente desistiu" }));
    const service = createOrderLocalOutcomeV2Service(store);

    await service.append(actor, orderId, "5", "LOCAL_CANCELLED", "  Cliente desistiu  ");
    expect(store.append).toHaveBeenCalledWith(ownerId, orderId, 5, expect.objectContaining({ note: "Cliente desistiu" }));
  });

  it.each([
    ["outcome outside the closed set", orderId, 5, "FINALIZED", null],
    ["malformed order identity", "order", 5, "LOCAL_FINALIZED", null],
    ["malformed version", orderId, "v5", "LOCAL_FINALIZED", null],
    ["invalid note", orderId, 5, "LOCAL_FINALIZED", "bad\u0007note"],
  ])("rejects %s without touching the store", async (_label, id, version, value, note) => {
    const store = storeWith(async () => outcome);
    const service = createOrderLocalOutcomeV2Service(store);
    await expect(service.append(actor, id, version, value, note)).rejects.toBeInstanceOf(OrderLocalOutcomeV2ValidationError);
    expect(store.append).not.toHaveBeenCalled();
  });

  it("requires an active merchant principal", async () => {
    const service = createOrderLocalOutcomeV2Service(storeWith(async () => outcome));
    await expect(service.append(admin, orderId, 5, "LOCAL_FINALIZED", null)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("maps a lost lifecycle CAS to the opaque conflict", async () => {
    const service = createOrderLocalOutcomeV2Service(storeWith(async () => null));
    await expect(service.append(actor, orderId, 5, "LOCAL_FINALIZED", null)).rejects.toBeInstanceOf(OrderEngagementV2ConflictError);
  });

  it.each(["LOCAL_FINALIZED", "LOCAL_CANCELLED"] as const)("maps a terminal re-submit of %s to the opaque conflict", async (outcomeValue) => {
    // The store's empty-ledger claim rejects any later append, even with a
    // refreshed version; the service maps that null to the same conflict.
    const service = createOrderLocalOutcomeV2Service(storeWith(async () => null));
    await expect(service.append(actor, orderId, 9, outcomeValue, null)).rejects.toBeInstanceOf(OrderEngagementV2ConflictError);
  });
});

describe("order-local-outcome-v2 store CAS", () => {
  function prismaWith(claimed: number) {
    const updateMany = vi.fn(async () => ({ count: claimed }));
    const create = vi.fn(async () => ({
      id: outcome.id,
      orderId,
      ownerId,
      outcome: "LOCAL_FINALIZED" as const,
      note: null,
      actorId: ownerId,
      createdAt: outcome.createdAt,
    }));
    const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({ orderV2: { updateMany }, orderLocalOutcomeV2: { create } }));
    const prisma = { $transaction: transaction } as unknown as PrismaClient;
    return { create, prisma, updateMany };
  }

  const values = { id: outcome.id, outcome: "LOCAL_FINALIZED" as const, note: null, actorId: ownerId, createdAt: outcome.createdAt, updatedAt: outcome.createdAt };

  it("claims the append only with an empty ledger and never inserts on a failed claim", async () => {
    const { create, prisma, updateMany } = prismaWith(0);
    const store = createOrderLocalOutcomeV2Store(prisma);

    await expect(store.append(ownerId, orderId, 3, values)).resolves.toBeNull();
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: orderId, ownerId, lifecycleVersion: 3, localOutcomes: { none: {} } },
      data: { lifecycleVersion: { increment: 1 }, updatedAt: values.updatedAt },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("inserts the outcome only after the guarded claim succeeds", async () => {
    const { create, prisma } = prismaWith(1);
    const store = createOrderLocalOutcomeV2Store(prisma);

    const created = await store.append(ownerId, orderId, 3, values);
    expect(created).toMatchObject({ id: outcome.id, outcome: "LOCAL_FINALIZED" });
    expect(create).toHaveBeenCalledWith({
      data: { id: outcome.id, orderId, ownerId, outcome: "LOCAL_FINALIZED", note: null, actorId: ownerId, createdAt: outcome.createdAt },
      select: { id: true, orderId: true, ownerId: true, outcome: true, note: true, actorId: true, createdAt: true },
    });
  });
});
