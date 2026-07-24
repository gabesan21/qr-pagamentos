import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "./authorization";
import {
  createPaymentLinkService,
  PaymentLinkConflictError,
  PaymentLinkDependencyError,
  PaymentLinkValidationError,
  type OwnerPaymentLink,
  type PaymentLinkCreateValues,
  type PaymentLinkStore,
} from "./payment-link";

const owner = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const admin = { ...owner, id: "admin", role: "ADMIN" as const };
const secondOwner = { ...owner, id: "second-owner" };
const productId = "11111111-1111-4111-8111-111111111111";
const currencyPairId = "22222222-2222-4222-8222-222222222222";
const product = { id: productId, internalName: "Donation", titlePtBr: "Doação", titleEn: "Donation", price: "999999999999.999999" };
const pair = { id: currencyPairId, label: "BRL/USDT" };

type TestPaymentLink = PaymentLinkCreateValues & { id: string; ownerId: string };

function testStore(): PaymentLinkStore & { created: TestPaymentLink[] } {
  const created: TestPaymentLink[] = [];
  const activeLinkIds = new Set<string>();
  const toOwnerPaymentLink = (values: TestPaymentLink): OwnerPaymentLink => ({
    id: values.id,
    identifier: values.identifier,
    linkType: values.linkType,
    expiresAt: values.expiresAt,
    active: activeLinkIds.has(values.id),
    createdAt: new Date("2026-07-20T12:00:00.000Z"),
    product,
    currencyPair: pair,
  });
  return {
    created,
    async list(ownerId) {
      return created.filter((values) => values.ownerId === ownerId).map(toOwnerPaymentLink);
    },
    async listActiveProducts(ownerId) { return ownerId === owner.id ? [product] : []; },
    async listActiveCurrencyPairs() { return [pair]; },
    async create(ownerId, values) {
      const link = {
        ...values,
        id: `${created.length + 1}`.padStart(8, "0") + "-0000-4000-8000-000000000000",
        ownerId,
      };
      created.push(link);
      activeLinkIds.add(link.id);
      return toOwnerPaymentLink(link);
    },
    async deactivate(ownerId, id) {
      const link = created.find((candidate) => candidate.id === id && candidate.ownerId === ownerId);
      if (!link || !activeLinkIds.has(link.id)) return false;
      activeLinkIds.delete(link.id);
      return true;
    },
  };
}

const input = (overrides: Record<string, unknown> = {}) => ({ productId, currencyPairId, linkType: "REUSABLE", expiresAt: "", ...overrides });

describe("payment-link service", () => {
  it("allows active accounts to inspect and mutate only their own payment links", async () => {
    const service = createPaymentLinkService(testStore());
    await expect(service.listForOwner(owner)).resolves.toMatchObject({ activeProducts: [product], activeCurrencyPairs: [pair] });
    await expect(service.create(owner, input())).resolves.toMatchObject({ active: true });
    await expect(service.listForOwner(secondOwner)).resolves.toMatchObject({ links: [], activeProducts: [] });
  });

  it("denies administrators before validation, randomness, or persistence", async () => {
    const repository = testStore();
    const operations = [
      vi.spyOn(repository, "list"),
      vi.spyOn(repository, "listActiveProducts"),
      vi.spyOn(repository, "listActiveCurrencyPairs"),
      vi.spyOn(repository, "create"),
      vi.spyOn(repository, "deactivate"),
    ];
    const randomBytes = vi.fn();
    const service = createPaymentLinkService(repository, { randomBytes, now: vi.fn() });

    await expect(service.listForOwner(admin)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.create(admin, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.deactivate(admin, null)).rejects.toBeInstanceOf(ForbiddenError);
    expect(operations.every((operation) => operation.mock.calls.length === 0)).toBe(true);
    expect(randomBytes).not.toHaveBeenCalled();
  });

  it("creates only active links with CSPRNG URL-safe identifiers and preserves exact prices by reference", async () => {
    const store = testStore();
    const service = createPaymentLinkService(store, { randomBytes: () => Buffer.alloc(18, 255), now: () => new Date("2026-07-20T12:00:00.000Z") });
    const link = await service.create(owner, input({ linkType: "SINGLE_USE", expiresAt: "2026-07-20T12:01" }));

    expect(link.identifier).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(store.created[0]).toMatchObject({ ownerId: owner.id, active: true, linkType: "SINGLE_USE", productId, currencyPairId });
    expect(store.created[0]?.expiresAt?.toISOString()).toBe("2026-07-20T12:01:00.000Z");
    expect((await service.listForOwner(owner)).links[0]?.product.price).toBe("999999999999.999999");
  });

  it("accepts blank expiry as null and rejects malformed, non-round-trippable, and non-future expiry", async () => {
    const service = createPaymentLinkService(testStore(), { randomBytes: () => Buffer.alloc(18), now: () => new Date("2026-07-20T12:00:00.000Z") });
    await expect(service.create(owner, input())).resolves.toMatchObject({ expiresAt: null });
    for (const expiresAt of ["2026-07-20", "2026-02-30T12:00", "2026-07-20T12:00", "2026-07-20T12:00:01"]) {
      await expect(service.create(owner, input({ expiresAt }))).rejects.toBeInstanceOf(PaymentLinkValidationError);
    }
  });

  it("rejects malformed product/pair identifiers and link types before mutation", async () => {
    const store = testStore();
    const service = createPaymentLinkService(store);
    for (const values of [input({ productId: "nope" }), input({ currencyPairId: ` ${currencyPairId}` }), input({ linkType: "MANY" })]) {
      await expect(service.create(owner, values)).rejects.toBeInstanceOf(PaymentLinkValidationError);
    }
    expect(store.created).toHaveLength(0);
  });

  it("retries bounded identifier collisions without persisting the failed attempt", async () => {
    const store = testStore();
    let calls = 0;
    store.create = async (_ownerId, values) => {
      calls += 1;
      if (calls === 1) throw { code: "P2002", meta: { target: "payment_link_identifier_key" } };
      return { id: randomUUID(), ...values, createdAt: new Date(), product, currencyPair: pair };
    };
    const service = createPaymentLinkService(store, { randomBytes: () => Buffer.alloc(18, calls), now: () => new Date("2026-07-20T12:00:00.000Z") });
    await expect(service.create(owner, input())).resolves.toMatchObject({ active: true });
    expect(calls).toBe(2);

  });

  it.each(["payment_link_product_active", "payment_link_currency_pair_active"])("maps Prisma P2004 %s trigger failures to an opaque dependency outcome", async (constraint) => {
    const store = testStore();
    store.create = async () => {
      throw { code: "P2004", meta: { database_error: `ERROR: constraint ${constraint}` } };
    };

    await expect(createPaymentLinkService(store).create(owner, input())).rejects.toBeInstanceOf(PaymentLinkDependencyError);
    expect(store.created).toHaveLength(0);
  });

  it.each([
    "prefix ERROR: constraint payment_link_product_active",
    "ERROR: constraint payment_link_currency_pair_active suffix",
    "ERROR: constraint unrelated_payment_link_product_active_context",
    "ERROR: unrelated check constraint",
  ])("does not treat non-exact Prisma P2004 diagnostic %j as an inactive dependency", async (databaseError) => {
    const store = testStore();
    store.create = async () => {
      throw { code: "P2004", meta: { database_error: databaseError } };
    };

    await expect(createPaymentLinkService(store).create(owner, input())).rejects.toBeInstanceOf(PaymentLinkConflictError);
  });

  it.each([
    { code: "P2003", meta: { database_error: "ERROR: constraint payment_link_product_active" } },
    { code: "P2004", meta: { database_error: 23514 } },
    { code: "P2004", meta: {} },
  ])("does not treat other Prisma error shapes as inactive dependencies", async (error) => {
    const store = testStore();
    store.create = async () => { throw error; };

    await expect(createPaymentLinkService(store).create(owner, input())).rejects.toBeInstanceOf(PaymentLinkConflictError);
  });

  it("fails opaquely after bounded collisions and revokes only the actor's link", async () => {
    const store = testStore();
    store.create = async () => { throw { code: "P2002", meta: { target: "payment_link_identifier_key" } }; };
    const service = createPaymentLinkService(store);
    await expect(service.create(owner, input())).rejects.toBeInstanceOf(PaymentLinkConflictError);

    const activeStore = testStore();
    const activeService = createPaymentLinkService(activeStore);
    const ownerLink = await activeService.create(owner, input());
    const foreignLink = await activeService.create(secondOwner, input());

    await expect(activeService.deactivate(secondOwner, ownerLink.id)).rejects.toBeInstanceOf(PaymentLinkConflictError);
    await expect(activeService.listForOwner(owner)).resolves.toMatchObject({ links: [{ id: ownerLink.id, active: true }] });
    await expect(activeService.listForOwner(secondOwner)).resolves.toMatchObject({ links: [{ id: foreignLink.id, active: true }] });

    await expect(activeService.deactivate(owner, ownerLink.id)).resolves.toBeUndefined();
    await expect(activeService.listForOwner(owner)).resolves.toMatchObject({ links: [{ id: ownerLink.id, active: false }] });
    await expect(activeService.listForOwner(secondOwner)).resolves.toMatchObject({ links: [{ id: foreignLink.id, active: true }] });
  });
});
