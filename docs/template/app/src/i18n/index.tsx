import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import ptBR from "./pt-BR";
import type { DictKey } from "./pt-BR";
import en from "./en";

export type Locale = "pt-BR" | "en";
export const LOCALES: Locale[] = ["pt-BR", "en"];
export const DEFAULT_LOCALE: Locale = "pt-BR";

const dicts: Record<Locale, Record<DictKey, string>> = { "pt-BR": ptBR, en };
const STORAGE_KEY = "qrp:locale";

export type { DictKey };

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  /** Translate a dictionary key; supports {var} interpolation. */
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
  /** Format an exact-decimal money amount (minor units are NOT used — pass major units as number). */
  formatMoney: (amount: number, currency?: string) => string;
  formatNumber: (n: number, opts?: Intl.NumberFormatOptions) => string;
  /** pt-BR: dd/MM/yyyy HH:mm · en: MM/dd/yyyy h:mm a */
  formatDateTime: (d: Date | string | number) => string;
  formatDate: (d: Date | string | number) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function toDate(d: Date | string | number): Date {
  return d instanceof Date ? d : new Date(d);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "en" || stored === "pt-BR" ? stored : DEFAULT_LOCALE;
  });

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l;
  }, []);

  const t = useCallback(
    (key: DictKey, vars?: Record<string, string | number>) => {
      let s: string = dicts[locale][key] ?? dicts["pt-BR"][key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replaceAll(`{${k}}`, String(v));
        }
      }
      return s;
    },
    [locale],
  );

  const formatMoney = useCallback(
    (amount: number, currency = "BRL") =>
      new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount),
    [locale],
  );

  const formatNumber = useCallback(
    (n: number, opts?: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale, opts).format(n),
    [locale],
  );

  const formatDateTime = useCallback(
    (d: Date | string | number) =>
      new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: locale === "en",
      }).format(toDate(d)),
    [locale],
  );

  const formatDate = useCallback(
    (d: Date | string | number) =>
      new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(toDate(d)),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, formatMoney, formatNumber, formatDateTime, formatDate }),
    [locale, setLocale, t, formatMoney, formatNumber, formatDateTime, formatDate],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
