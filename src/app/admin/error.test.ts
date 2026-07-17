import { describe, expect, it } from "vitest";

import { en } from "@/i18n/dictionaries/en";
import { ptBR } from "@/i18n/dictionaries/pt-BR";

import { getAdminErrorDictionary } from "./error";

describe("admin recovery state", () => {
  it.each([
    ["en", en],
    ["pt-BR", ptBR],
  ] as const)("selects the %s read-error and retry copy", (language, expected) => {
    const dictionary = getAdminErrorDictionary(language);
    expect(dictionary.adminReadErrorHeading).toBe(expected.adminReadErrorHeading);
    expect(dictionary.adminReadErrorDescription).toBe(expected.adminReadErrorDescription);
    expect(dictionary.adminRetry).toBe(expected.adminRetry);
  });
});
