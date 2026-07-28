import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "./authorization";
import {
  createPaymentLinkV2Service,
  PaymentLinkV2ConflictError,
  PaymentLinkV2DependencyError,
  PaymentLinkV2FinancialEditLockedError,
  PaymentLinkV2ValidationError,
  type OwnerPaymentLinkV2,
  type PaymentLinkV2EditValues,
  type PaymentLinkV2Store,
} from "./payment-link-v2";

const owner = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const admin = { ...owner, id: "admin", role: "ADMIN" as const };
const productOneId = "11111111-1111-4111-8111-111111111111";
const productTwoId = "22222222-2222-4222-8222-222222222222";
const currencyPairId = "33333333-3333-4333-8333-333333333333";
const linkId = "44444444-4444-4444-8444-444444444444";
const createdAt = new Date("2026-07-25T12:00:00.000Z");

type StoredValues = Readonly<Record<string, unknown>> & { ownerId: string; id: string; version: number; active: boolean };

function toOwnerLink(values: StoredValues): OwnerPaymentLinkV2 {
  return {
    id: values.id,
    identifier: values.identifier as string,
    compositionKind: values.compositionKind as OwnerPaymentLinkV2["compositionKind"],
    descriptionPtBr: (values.descriptionPtBr ?? null) as string | null,
    descriptionEn: (values.descriptionEn ?? null) as string | null,
    amount: (values.amount ?? null) as string | null,
    currencyPairId: values.currencyPairId as string,
    linkType: values.linkType as OwnerPaymentLinkV2["linkType"],
    expiresAt: (values.expiresAt ?? null) as Date | null,
    active: values.active,
    version: values.version,
    createdAt,
    updatedAt: createdAt,
    lines: (values.lines as OwnerPaymentLinkV2["lines"]) ?? [],
  };
}

function testStore(options: { attempts?: boolean } = {}) {
  const stored: StoredValues[] = [];
  const store: PaymentLinkV2Store & { stored: StoredValues[] } = {
    stored,
    async findOwned(ownerId, id) {
      const link = stored.find((candidate) => candidate.id === id && candidate.ownerId === ownerId);
      return link ? toOwnerLink(link) : null;
    },
    async identifierTaken(identifier) {
      return stored.some((candidate) => candidate.identifier === identifier);
    },
    async create(ownerId, values) {
      const link: StoredValues = { ...values, ownerId, version: 0, active: true };
      stored.push(link);
      return toOwnerLink(link);
    },
    async edit(ownerId, id, version, values) {
      const link = stored.find((candidate) => candidate.id === id && candidate.ownerId === ownerId && candidate.version === version);
      if (!link) return null;
      const next: StoredValues = {
        ...link,
        expiresAt: values.expiresAt,
        version: version + 1,
        ...(values.financial
          ? {
            descriptionPtBr: values.financial.descriptionPtBr,
            descriptionEn: values.financial.descriptionEn,
            amount: values.financial.amount,
            lines: values.financial.lines,
          }
          : {}),
      };
      stored.splice(stored.indexOf(link), 1, next);
      return toOwnerLink(next);
    },
    async setActive(ownerId, id, version, active) {
      const link = stored.find((candidate) => candidate.id === id && candidate.ownerId === ownerId && candidate.version === version);
      if (!link) return null;
      const next = { ...link, active, version: version + 1 };
      stored.splice(stored.indexOf(link), 1, next);
      return toOwnerLink(next);
    },
    async hasCheckoutAttempt() {
      return options.attempts === true;
    },
  };
  return store;
}

let randomFill = 7;
const dependencies = { randomBytes: () => Buffer.alloc(18, randomFill++ % 256), now: () => createdAt };
const linesInput = (lines: ReadonlyArray<Record<string, unknown>>) => JSON.stringify(lines);
const linesCreateInput = (overrides: Record<string, unknown> = {}) => ({
  compositionKind: "PRODUCT_LINES",
  currencyPairId,
  linkType: "REUSABLE",
  expiresAt: "",
  lines: linesInput([{ productId: productOneId, quantity: 2 }, { productId: productTwoId, quantity: "1" }]),
  ...overrides,
});
const fixedCreateInput = (overrides: Record<string, unknown> = {}) => ({
  compositionKind: "FIXED_AMOUNT",
  currencyPairId,
  linkType: "SINGLE_USE",
  expiresAt: "",
  descriptionPtBr: "Doação",
  descriptionEn: "Donation",
  amount: "10.25",
  ...overrides,
});

describe("payment-link-v2 service", () => {
  it("creates both composition kinds with CSPRNG identifiers and application-supplied metadata", async () => {
    const store = testStore();
    const service = createPaymentLinkV2Service(store, dependencies);

    const linesLink = await service.create(owner, linesCreateInput({ expiresAt: "2026-07-25T12:01" }));
    expect(linesLink.identifier).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(linesLink).toMatchObject({ compositionKind: "PRODUCT_LINES", active: true, version: 0, linkType: "REUSABLE" });
    expect(linesLink.expiresAt?.toISOString()).toBe("2026-07-25T12:01:00.000Z");
    expect(linesLink.lines).toEqual([
      { productId: productOneId, position: 1, quantity: 2 },
      { productId: productTwoId, position: 2, quantity: 1 },
    ]);

    const fixedLink = await service.create(owner, fixedCreateInput());
    expect(fixedLink).toMatchObject({ compositionKind: "FIXED_AMOUNT", descriptionPtBr: "Doação", descriptionEn: "Donation", amount: "10.25", lines: [] });
    expect(store.stored).toHaveLength(2);
  });

  it("denies administrators before validation, randomness, or persistence", async () => {
    const store = testStore();
    const operations = [vi.spyOn(store, "findOwned"), vi.spyOn(store, "identifierTaken"), vi.spyOn(store, "create"), vi.spyOn(store, "edit"), vi.spyOn(store, "setActive"), vi.spyOn(store, "hasCheckoutAttempt")];
    const randomBytes = vi.fn();
    const service = createPaymentLinkV2Service(store, { randomBytes, now: vi.fn() });

    await expect(service.create(admin, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.edit(admin, null, null, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.setActive(admin, null, null, null)).rejects.toBeInstanceOf(ForbiddenError);
    expect(operations.every((operation) => operation.mock.calls.length === 0)).toBe(true);
    expect(randomBytes).not.toHaveBeenCalled();
  });

  it("rejects malformed composition kinds, types, identifiers, and expiry before persistence", async () => {
    const store = testStore();
    const service = createPaymentLinkV2Service(store, dependencies);
    for (const values of [
      linesCreateInput({ compositionKind: "MULTI" }),
      linesCreateInput({ linkType: "UNLIMITED" }),
      linesCreateInput({ currencyPairId: "nope" }),
      linesCreateInput({ expiresAt: "2026-07-25" }),
      linesCreateInput({ expiresAt: "2026-07-25T11:59" }),
      linesCreateInput({ expiresAt: "2026-02-30T12:00" }),
    ]) {
      await expect(service.create(owner, values)).rejects.toBeInstanceOf(PaymentLinkV2ValidationError);
    }
    expect(store.stored).toHaveLength(0);
  });

  it("rejects out-of-grammar amounts and malformed bilingual descriptions", async () => {
    const store = testStore();
    const service = createPaymentLinkV2Service(store, dependencies);
    for (const amount of ["0", "00.1", "01", "1.0", "1.230", "0.0000001", "9999999999999", "-1", "+1", "1e2", "1,2", " 1"]) {
      await expect(service.create(owner, fixedCreateInput({ amount }))).rejects.toBeInstanceOf(PaymentLinkV2ValidationError);
    }
    for (const overrides of [
      { descriptionPtBr: "  " },
      { descriptionEn: "one\ntwo" },
      { descriptionPtBr: "x".repeat(161) },
      { descriptionEn: 42 },
    ]) {
      await expect(service.create(owner, fixedCreateInput(overrides))).rejects.toBeInstanceOf(PaymentLinkV2ValidationError);
    }
    for (const amount of ["0.000001", "1.25", "999999999999.999999"]) {
      await expect(service.create(owner, fixedCreateInput({ amount }))).resolves.toMatchObject({ amount });
    }
  });

  it("rejects malformed, empty, oversized, duplicated, and out-of-range line compositions", async () => {
    const store = testStore();
    const service = createPaymentLinkV2Service(store, dependencies);
    const twentyOne = Array.from({ length: 21 }, (_, index) => ({ productId: randomUUID(), quantity: 1 }));
    for (const lines of [
      "not json",
      linesInput([]),
      linesInput(twentyOne),
      linesInput([{ productId: productOneId, quantity: 1 }, { productId: productOneId.toUpperCase(), quantity: 1 }]),
      linesInput([{ productId: "nope", quantity: 1 }]),
      linesInput([{ productId: productOneId, quantity: 0 }]),
      linesInput([{ productId: productOneId, quantity: 10_000 }]),
      linesInput([{ productId: productOneId, quantity: 1.5 }]),
      linesInput([{ productId: productOneId, quantity: "01" }]),
    ]) {
      await expect(service.create(owner, linesCreateInput({ lines }))).rejects.toBeInstanceOf(PaymentLinkV2ValidationError);
    }
    expect(store.stored).toHaveLength(0);
  });

  it("maps store dependency unavailability to the opaque dependency outcome", async () => {
    const store = testStore();
    store.create = async () => "dependency-unavailable";
    await expect(createPaymentLinkV2Service(store, dependencies).create(owner, linesCreateInput())).rejects.toBeInstanceOf(PaymentLinkV2DependencyError);
    expect(store.stored).toHaveLength(0);
  });

  it("retries bounded identifier collisions across the shared namespace", async () => {
    const store = testStore();
    let probes = 0;
    store.identifierTaken = async () => {
      probes += 1;
      return probes === 1;
    };
    const randomValues = [Buffer.alloc(18, 1), Buffer.alloc(18, 2)];
    const service = createPaymentLinkV2Service(store, { randomBytes: () => randomValues.shift() ?? Buffer.alloc(18, 3), now: () => createdAt });
    await expect(service.create(owner, fixedCreateInput())).resolves.toMatchObject({ active: true });
    expect(probes).toBe(2);

    const colliding = testStore();
    colliding.create = async () => {
      throw { code: "P2002", meta: { target: "payment_link_v2_identifier_key" } };
    };
    await expect(createPaymentLinkV2Service(colliding, dependencies).create(owner, fixedCreateInput())).rejects.toBeInstanceOf(PaymentLinkV2ConflictError);
  });

  it("edits financial composition through expected-version CAS while the attempt seam observes none", async () => {
    const store = testStore();
    const service = createPaymentLinkV2Service(store, dependencies);
    const link = await service.create(owner, linesCreateInput());

    const edited = await service.edit(owner, link.id, 0, { lines: linesInput([{ productId: productTwoId, quantity: 5 }]) });
    expect(edited).toMatchObject({ version: 1, lines: [{ productId: productTwoId, position: 1, quantity: 5 }] });

    await expect(service.edit(owner, link.id, 0, { lines: linesInput([{ productId: productOneId, quantity: 1 }]) })).rejects.toBeInstanceOf(PaymentLinkV2ConflictError);
    await expect(service.edit(owner, randomUUID(), 1, {})).rejects.toBeInstanceOf(PaymentLinkV2ConflictError);
    const secondOwner = { ...owner, id: "second-owner" };
    await expect(service.edit(secondOwner, link.id, 1, {})).rejects.toBeInstanceOf(PaymentLinkV2ConflictError);
  });

  it("rejects financial edits once the attempt seam reports one, without touching the store", async () => {
    const store = testStore({ attempts: true });
    const service = createPaymentLinkV2Service(store, dependencies);
    const link = await service.create(owner, fixedCreateInput());
    const edit = vi.spyOn(store, "edit");

    await expect(service.edit(owner, link.id, 0, { amount: "11" })).rejects.toBeInstanceOf(PaymentLinkV2FinancialEditLockedError);
    expect(edit).not.toHaveBeenCalled();
    await expect(service.edit(owner, link.id, 0, { expiresAt: "2026-07-25T13:00" })).resolves.toMatchObject({ version: 1 });
  });

  it("keeps the stored expiry when the edit input omits it and maps edit dependency loss", async () => {
    const store = testStore();
    const service = createPaymentLinkV2Service(store, dependencies);
    const link = await service.create(owner, fixedCreateInput({ expiresAt: "2026-07-25T13:00" }));

    const edited = await service.edit(owner, link.id, 0, { descriptionPtBr: "Doação", descriptionEn: "Donation", amount: "11.5" });
    expect(edited.expiresAt?.toISOString()).toBe("2026-07-25T13:00:00.000Z");
    expect(edited).toMatchObject({ amount: "11.5", version: 1 });

    store.edit = async () => "dependency-unavailable";
    await expect(service.edit(owner, link.id, 1, { descriptionPtBr: "Doação", descriptionEn: "Donation", amount: "12" })).rejects.toBeInstanceOf(PaymentLinkV2DependencyError);
  });

  it("activates and deactivates through expected-version CAS only", async () => {
    const store = testStore();
    const service = createPaymentLinkV2Service(store, dependencies);
    const link = await service.create(owner, linesCreateInput());

    await expect(service.setActive(owner, link.id, 0, "maybe")).rejects.toBeInstanceOf(PaymentLinkV2ValidationError);
    await expect(service.setActive(owner, link.id, 0, "false")).resolves.toMatchObject({ active: false, version: 1 });
    await expect(service.setActive(owner, link.id, 0, "true")).rejects.toBeInstanceOf(PaymentLinkV2ConflictError);
    await expect(service.setActive(owner, link.id, 1, true)).resolves.toMatchObject({ active: true, version: 2 });
  });

  it("rejects cross-owner activation and deactivation with the same opaque conflict", async () => {
    const store = testStore();
    const service = createPaymentLinkV2Service(store, dependencies);
    const link = await service.create(owner, linesCreateInput());
    const otherOwner = { ...owner, id: "other-owner" };

    await expect(service.setActive(otherOwner, link.id, 0, "false")).rejects.toBeInstanceOf(PaymentLinkV2ConflictError);
  });

  it("validates identifiers and versions before any store read", async () => {
    const store = testStore();
    const findOwned = vi.spyOn(store, "findOwned");
    const service = createPaymentLinkV2Service(store, dependencies);
    for (const [id, version] of [["nope", 0], [linkId, -1], [linkId, "1.5"], [linkId, "01"]]) {
      await expect(service.edit(owner, id, version, {})).rejects.toBeInstanceOf(PaymentLinkV2ValidationError);
    }
    expect(findOwned).not.toHaveBeenCalled();
  });
});
