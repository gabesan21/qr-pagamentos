import "server-only";

import { en } from "./dictionaries/en";
import { ptBR } from "./dictionaries/pt-BR";
import type { SupportedLocale } from "./locales";

const dictionaries = {
  "pt-BR": ptBR,
  en,
} satisfies Record<SupportedLocale, Record<keyof typeof en, string>>;

export function getDictionary(locale: SupportedLocale) {
  return dictionaries[locale];
}
