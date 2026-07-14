import { describe, expect, it } from "vitest";

import { en } from "./dictionaries/en";
import { ptBR } from "./dictionaries/pt-BR";
import { isSupportedLocale, supportedLocales } from "./locales";

describe("locale contracts", () => {
  it("supports exactly Brazilian Portuguese and English", () => {
    expect(supportedLocales).toEqual(["pt-BR", "en"]);
  });

  it("validates locale values deterministically", () => {
    expect(isSupportedLocale("pt-BR")).toBe(true);
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("es")).toBe(false);
  });

  it("keeps dictionary keys in parity", () => {
    expect(Object.keys(ptBR).sort()).toEqual(Object.keys(en).sort());
  });
});
