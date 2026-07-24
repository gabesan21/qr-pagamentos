import { describe, expect, it } from "vitest";

import { en } from "./dictionaries/en";
import { ptBR } from "./dictionaries/pt-BR";
import { defaultLocale, isSupportedLocale, localeFromPreferenceCookie, negotiateLocale, supportedLocales } from "./locales";

describe("locale contracts", () => {
  it("supports exactly Brazilian Portuguese and English", () => {
    expect(supportedLocales).toEqual(["pt-BR", "en"]);
  });

  it("validates locale values deterministically", () => {
    expect(isSupportedLocale("pt-BR")).toBe(true);
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("es")).toBe(false);
  });

  it("negotiates only supported tags with deterministic quality and order handling", () => {
    expect(negotiateLocale(null)).toBe(defaultLocale);
    expect(negotiateLocale("malformed;q=bogus, es;q=0.9")).toBe(defaultLocale);
    expect(negotiateLocale("en;q=0.2, pt;q=0.8")).toBe("pt-BR");
    expect(negotiateLocale("en-US;q=0.5, pt-PT;q=0.5")).toBe("en");
    expect(negotiateLocale("*, es;q=1")).toBe(defaultLocale);
    expect(negotiateLocale("en,".padEnd(4097, "x"))).toBe(defaultLocale);
  });

  it("accepts only the closed persisted-locale cookie values", () => {
    expect(localeFromPreferenceCookie("en")).toBe("en");
    expect(localeFromPreferenceCookie("pt-BR")).toBe("pt-BR");
    expect(localeFromPreferenceCookie("es")).toBe(defaultLocale);
    expect(localeFromPreferenceCookie(undefined)).toBe(defaultLocale);
  });

  it("keeps dictionary keys in parity", () => {
    expect(Object.keys(ptBR).sort()).toEqual(Object.keys(en).sort());
  });
});
