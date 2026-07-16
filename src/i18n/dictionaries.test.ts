import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDictionary } from "./dictionaries";
import { en } from "./dictionaries/en";
import { ptBR } from "./dictionaries/pt-BR";

describe("language dictionaries", () => {
  it("keeps the closed dictionaries in parity", () => {
    expect(Object.keys(ptBR).sort()).toEqual(Object.keys(en).sort());
  });

  it("exposes the language-control copy for each supported locale", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const dictionary = getDictionary(locale);
      expect(dictionary.languageHeading).not.toBe("");
      expect(dictionary.languageLabel).not.toBe("");
      expect(dictionary.languageSave).not.toBe("");
      expect(dictionary.languageSaved).not.toBe("");
      expect(dictionary.languageError).not.toBe("");
      expect(dictionary.adminPaymentSettingsHeading).not.toBe("");
      expect(dictionary.adminSavePaymentSettings).not.toBe("");
    }
  });
});
