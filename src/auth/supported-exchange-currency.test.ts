import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "./authorization";
import {
  createSupportedExchangeCurrencyService,
  ExchangeCurrencyCodeConflictError,
  ExchangeCurrencyDuplicatePairError,
  ExchangeCurrencyValidationError,
  NoActiveExchangeCurrencyMappingError,
  type ExchangeCurrencyMappingValues,
  type SupportedExchangeCurrencyStore,
} from "./supported-exchange-currency";

const principal = (id: string, role: "USER" | "ADMIN" = "USER", status: "ACTIVE" | "DISABLED" = "ACTIVE") => ({
  id,
  username: id,
  email: null,
  role,
  status,
  createdAt: new Date(),
});

type PairRow = ExchangeCurrencyMappingValues & { id: string };

function testStore() {
  const pairs: PairRow[] = [];
  const pointers = new Map<string, string>();
  let serial = Promise.resolve();

  async function serialized<T>(operation: () => T): Promise<T> {
    let release!: () => void;
    const previous = serial;
    serial = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return operation();
    } finally {
      release();
    }
  }

  const store: SupportedExchangeCurrencyStore = {
    async listActive() {
      return [...pointers.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([code, pairId]) => ({ code, label: pairs.find((pair) => pair.id === pairId)!.label }));
    },
    async findActivePair(code) {
      const pairId = pointers.get(code);
      const pair = pairs.find((candidate) => candidate.id === pairId);
      if (!pair) return null;
      return { code: pair.code, label: pair.label, currencyUuid: pair.currencyUuid, exchangeCurrencyUuid: pair.exchangeCurrencyUuid };
    },
    async register(values) {
      return serialized(() => {
        if (pairs.some((pair) => pair.currencyUuid === values.currencyUuid && pair.exchangeCurrencyUuid === values.exchangeCurrencyUuid)) {
          return "pair-exists" as const;
        }
        if (pointers.has(values.code)) return "code-active" as const;
        pairs.push({ ...values, id: randomUUID() });
        pointers.set(values.code, pairs.at(-1)!.id);
        return "registered" as const;
      });
    },
    async replace(values) {
      return serialized(() => {
        let pair = pairs.find((candidate) =>
          candidate.currencyUuid === values.currencyUuid && candidate.exchangeCurrencyUuid === values.exchangeCurrencyUuid);
        let outcome: "inserted" | "repointed" = "repointed";
        if (!pair) {
          pair = { ...values, id: randomUUID() };
          pairs.push(pair);
          outcome = "inserted";
        }
        pointers.set(values.code, pair.id);
        return outcome;
      });
    },
    async deactivate(code) {
      pointers.delete(code);
    },
  };
  return { store, pairs, pointers };
}

const mapping = (overrides: Partial<Record<keyof ExchangeCurrencyMappingValues, unknown>> = {}) => ({
  code: "BRL",
  label: "BRL/USDT",
  currencyUuid: randomUUID(),
  exchangeCurrencyUuid: randomUUID(),
  ...overrides,
});

describe("supported exchange currency service", () => {
  it("denies non-administrators before validation or persistence on every mutation", async () => {
    const store: SupportedExchangeCurrencyStore = {
      listActive: vi.fn(),
      findActivePair: vi.fn(),
      register: vi.fn(),
      replace: vi.fn(),
      deactivate: vi.fn(),
    };
    const service = createSupportedExchangeCurrencyService(store);

    await expect(service.register(principal("owner"), mapping())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.replace(principal("admin", "ADMIN", "DISABLED"), mapping())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.deactivate(principal("owner"), "BRL")).rejects.toBeInstanceOf(ForbiddenError);
    expect(store.register).not.toHaveBeenCalled();
    expect(store.replace).not.toHaveBeenCalled();
    expect(store.deactivate).not.toHaveBeenCalled();
  });

  it("denies administrators and disabled owners the redacted owner reads", async () => {
    const store: SupportedExchangeCurrencyStore = {
      listActive: vi.fn(),
      findActivePair: vi.fn(),
      register: vi.fn(),
      replace: vi.fn(),
      deactivate: vi.fn(),
    };
    const service = createSupportedExchangeCurrencyService(store);

    await expect(service.listActiveChoices(principal("admin", "ADMIN"))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.resolveDefaultChoice(principal("owner", "USER", "DISABLED"))).rejects.toBeInstanceOf(ForbiddenError);
    expect(store.listActive).not.toHaveBeenCalled();
    expect(store.findActivePair).not.toHaveBeenCalled();
  });

  it("enforces the exact uppercase ISO code format and canonical UUIDs at the service boundary", async () => {
    const service = createSupportedExchangeCurrencyService(testStore().store);
    const admin = principal("admin", "ADMIN");

    for (const code of ["brl", "BR", "BRLA", "B1L", " RLB", ""]) {
      await expect(service.register(admin, mapping({ code }))).rejects.toBeInstanceOf(ExchangeCurrencyValidationError);
    }
    await expect(service.register(admin, mapping({ currencyUuid: "not-a-uuid" }))).rejects.toBeInstanceOf(ExchangeCurrencyValidationError);
    await expect(service.register(admin, mapping({ exchangeCurrencyUuid: "" }))).rejects.toBeInstanceOf(ExchangeCurrencyValidationError);
    await expect(service.register(admin, mapping({ label: " " }))).rejects.toBeInstanceOf(ExchangeCurrencyValidationError);
    await expect(service.register(admin, mapping({ label: "x".repeat(129) }))).rejects.toBeInstanceOf(ExchangeCurrencyValidationError);
  });

  it("registers a mapping with trimmed label and lowercased UUIDs, and reads it back redacted", async () => {
    const { store } = testStore();
    const service = createSupportedExchangeCurrencyService(store);
    const admin = principal("admin", "ADMIN");
    const currencyUuid = randomUUID().toUpperCase();

    await service.register(admin, mapping({ label: "  BRL/USDT  ", currencyUuid }));
    const choices = await service.listActiveChoices(principal("owner"));
    expect(choices).toEqual([{ code: "BRL", label: "BRL/USDT" }]);
    expect(Object.keys(choices[0]).sort()).toEqual(["code", "label"]);
    const pair = await service.requireActivePair("BRL");
    expect(pair.currencyUuid).toBe(currencyUuid.toLowerCase());
  });

  it("maps re-registration of a known pair to one typed duplicate-pair conflict", async () => {
    const { store, pairs } = testStore();
    const service = createSupportedExchangeCurrencyService(store);
    const admin = principal("admin", "ADMIN");
    const input = mapping();

    await service.register(admin, input);
    await expect(service.register(admin, mapping({ code: "ARS", currencyUuid: input.currencyUuid, exchangeCurrencyUuid: input.exchangeCurrencyUuid })))
      .rejects.toBeInstanceOf(ExchangeCurrencyDuplicatePairError);
    expect(pairs).toHaveLength(1);
  });

  it("rejects registering a second mapping for an active code with a typed conflict", async () => {
    const service = createSupportedExchangeCurrencyService(testStore().store);
    const admin = principal("admin", "ADMIN");

    await service.register(admin, mapping());
    await expect(service.register(admin, mapping())).rejects.toBeInstanceOf(ExchangeCurrencyCodeConflictError);
  });

  it("re-points the pointer to a retained pair row on replace and on restore after deactivation", async () => {
    const { store, pairs } = testStore();
    const service = createSupportedExchangeCurrencyService(store);
    const admin = principal("admin", "ADMIN");
    const original = mapping();

    await service.register(admin, original);
    await service.deactivate(admin, "BRL");
    await expect(service.requireActivePair("BRL")).rejects.toBeInstanceOf(NoActiveExchangeCurrencyMappingError);

    await service.replace(admin, original);
    expect(pairs).toHaveLength(1);
    expect((await service.requireActivePair("BRL")).currencyUuid).toBe(original.currencyUuid);

    const replacement = mapping();
    await service.replace(admin, replacement);
    expect(pairs).toHaveLength(2);
    expect((await service.requireActivePair("BRL")).currencyUuid).toBe(replacement.currencyUuid);
    expect(await service.listActiveChoices(principal("owner"))).toEqual([{ code: "BRL", label: replacement.label }]);
  });

  it("resolves active BRL as the default and explicit unavailable otherwise, never falling back", async () => {
    const service = createSupportedExchangeCurrencyService(testStore().store);
    const admin = principal("admin", "ADMIN");
    const owner = principal("owner");

    await expect(service.resolveDefaultChoice(owner)).resolves.toEqual({ status: "unavailable" });
    await service.register(admin, mapping({ code: "ARS", label: "ARS/USDT" }));
    await expect(service.resolveDefaultChoice(owner)).resolves.toEqual({ status: "unavailable" });
    await service.register(admin, mapping({ code: "BRL", label: "BRL/USDT" }));
    await expect(service.resolveDefaultChoice(owner)).resolves.toEqual({ status: "available", choice: { code: "BRL", label: "BRL/USDT" } });
    await service.deactivate(admin, "BRL");
    await expect(service.resolveDefaultChoice(owner)).resolves.toEqual({ status: "unavailable" });
    await expect(service.requireDefaultPair()).rejects.toBeInstanceOf(NoActiveExchangeCurrencyMappingError);
  });

  it("exposes the typed unavailable signal for a missing or inactive mapping", async () => {
    const service = createSupportedExchangeCurrencyService(testStore().store);

    await expect(service.requireActivePair("COP")).rejects.toBeInstanceOf(NoActiveExchangeCurrencyMappingError);
    await expect(service.requireActivePair("cop")).rejects.toBeInstanceOf(ExchangeCurrencyValidationError);
  });

  it("keeps a single active mapping per code under concurrent registration and replacement", async () => {
    const { store, pointers } = testStore();
    const service = createSupportedExchangeCurrencyService(store);
    const admin = principal("admin", "ADMIN");

    const registrations = await Promise.allSettled([
      service.register(admin, mapping()),
      service.register(admin, mapping()),
    ]);
    expect(registrations.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(pointers.size).toBe(1);

    const replacements = await Promise.allSettled([
      service.replace(admin, mapping()),
      service.replace(admin, mapping()),
    ]);
    expect(replacements.every((result) => result.status === "fulfilled")).toBe(true);
    expect(pointers.size).toBe(1);
    expect(await service.listActiveChoices(principal("owner"))).toHaveLength(1);
  });
});
