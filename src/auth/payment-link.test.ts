import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { ForbiddenError } from "./authorization";
import {
  createPaymentLinkService,
  PaymentLinkConflictError,
  PaymentLinkDependencyError,
  PaymentLinkValidationError,
  type AdminPaymentLink,
  type PaymentLinkCreateValues,
  type PaymentLinkStore,
} from "./payment-link";

const admin = { id: "admin", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };
const user = { ...admin, role: "USER" as const };
const productId = "11111111-1111-4111-8111-111111111111";
const currencyPairId = "22222222-2222-4222-8222-222222222222";
const product = { id: productId, internalName: "Donation", titlePtBr: "Doação", titleEn: "Donation", price: "999999999999.999999" };
const pair = { id: currencyPairId, label: "BRL/USDT" };

function testStore(): PaymentLinkStore & { created: PaymentLinkCreateValues[]; active: boolean } {
  const created: PaymentLinkCreateValues[] = [];
  let active = true;
  return {
    created,
    get active() { return active; },
    async list() {
      return created.map((values, index) => ({
        id: `${index + 1}`.padStart(8, "0") + "-0000-4000-8000-000000000000",
        identifier: values.identifier,
        linkType: values.linkType,
        expiresAt: values.expiresAt,
        active,
        createdAt: new Date("2026-07-20T12:00:00.000Z"),
        product,
        currencyPair: pair,
      })) as AdminPaymentLink[];
    },
    async listActiveProducts() { return [product]; },
    async listActiveCurrencyPairs() { return [pair]; },
    async create(values) {
      created.push(values);
      return (await this.list())[created.length - 1]!;
    },
    async deactivate() {
      if (!active) return false;
      active = false;
      return true;
    },
  };
}

const input = (overrides: Record<string, unknown> = {}) => ({ productId, currencyPairId, linkType: "REUSABLE", expiresAt: "", ...overrides });

describe("payment-link service", () => {
  it("allows only active administrators to inspect or mutate payment links", async () => {
    const service = createPaymentLinkService(testStore());
    await expect(service.listForAdmin(admin)).resolves.toMatchObject({ activeProducts: [product], activeCurrencyPairs: [pair] });
    await expect(service.create(user, input())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("creates only active links with CSPRNG URL-safe identifiers and preserves exact prices by reference", async () => {
    const store = testStore();
    const service = createPaymentLinkService(store, { randomBytes: () => Buffer.alloc(18, 255), now: () => new Date("2026-07-20T12:00:00.000Z") });
    const link = await service.create(admin, input({ linkType: "SINGLE_USE", expiresAt: "2026-07-20T12:01" }));

    expect(link.identifier).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(store.created[0]).toMatchObject({ active: true, linkType: "SINGLE_USE", productId, currencyPairId });
    expect(store.created[0]?.expiresAt?.toISOString()).toBe("2026-07-20T12:01:00.000Z");
    expect((await service.listForAdmin(admin)).links[0]?.product.price).toBe("999999999999.999999");
  });

  it("accepts blank expiry as null and rejects malformed, non-round-trippable, and non-future expiry", async () => {
    const service = createPaymentLinkService(testStore(), { randomBytes: () => Buffer.alloc(18), now: () => new Date("2026-07-20T12:00:00.000Z") });
    await expect(service.create(admin, input())).resolves.toMatchObject({ expiresAt: null });
    for (const expiresAt of ["2026-07-20", "2026-02-30T12:00", "2026-07-20T12:00", "2026-07-20T12:00:01"]) {
      await expect(service.create(admin, input({ expiresAt }))).rejects.toBeInstanceOf(PaymentLinkValidationError);
    }
  });

  it("rejects malformed product/pair identifiers and link types before mutation", async () => {
    const store = testStore();
    const service = createPaymentLinkService(store);
    for (const values of [input({ productId: "nope" }), input({ currencyPairId: ` ${currencyPairId}` }), input({ linkType: "MANY" })]) {
      await expect(service.create(admin, values)).rejects.toBeInstanceOf(PaymentLinkValidationError);
    }
    expect(store.created).toHaveLength(0);
  });

  it("retries bounded identifier collisions and maps trigger dependency failures without persisting", async () => {
    const store = testStore();
    let calls = 0;
    store.create = async (values) => {
      calls += 1;
      if (calls === 1) throw { code: "P2002", meta: { target: "payment_link_identifier_key" } };
      return { id: randomUUID(), ...values, createdAt: new Date(), product, currencyPair: pair };
    };
    const service = createPaymentLinkService(store, { randomBytes: () => Buffer.alloc(18, calls), now: () => new Date("2026-07-20T12:00:00.000Z") });
    await expect(service.create(admin, input())).resolves.toMatchObject({ active: true });
    expect(calls).toBe(2);

    store.create = async () => { throw { code: "23514", constraint: "payment_link_product_active" }; };
    await expect(service.create(admin, input())).rejects.toBeInstanceOf(PaymentLinkDependencyError);
  });

  it("fails opaquely after bounded collisions and makes revocation one-way", async () => {
    const store = testStore();
    store.create = async () => { throw { code: "P2002", meta: { target: "payment_link_identifier_key" } }; };
    const service = createPaymentLinkService(store);
    await expect(service.create(admin, input())).rejects.toBeInstanceOf(PaymentLinkConflictError);

    const activeStore = testStore();
    const activeService = createPaymentLinkService(activeStore);
    await expect(activeService.deactivate(admin, productId)).resolves.toBeUndefined();
    await expect(activeService.deactivate(admin, productId)).rejects.toBeInstanceOf(PaymentLinkConflictError);
  });
});
