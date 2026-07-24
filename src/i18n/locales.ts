export const supportedLocales = ["pt-BR", "en"] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export function isSupportedLocale(value: string): value is SupportedLocale {
  return supportedLocales.some((locale) => locale === value);
}

export const defaultLocale: SupportedLocale = "pt-BR";
export const localePreferenceCookieName = "qr_locale";

export function localeFromPreferenceCookie(value: string | null | undefined): SupportedLocale {
  return value && isSupportedLocale(value) ? value : defaultLocale;
}

export function negotiateLocale(header: string | null | undefined): SupportedLocale {
  if (!header || header.length > 4096) return defaultLocale;
  const candidates = header.split(",").map((part, index) => {
    const [tag, ...parameters] = part.trim().split(";");
    const qualityParameter = parameters.find((parameter) => parameter.trim().toLowerCase().startsWith("q="));
    const quality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1;
    return { tag: tag?.trim(), quality: Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0, index };
  }).filter((candidate): candidate is { tag: string; quality: number; index: number } => Boolean(candidate.tag) && candidate.quality > 0);

  for (const candidate of candidates.sort((left, right) => right.quality - left.quality || left.index - right.index)) {
    if (isSupportedLocale(candidate.tag)) return candidate.tag;
    const primary = candidate.tag.split("-")[0]?.toLowerCase();
    if (primary === "pt") return "pt-BR";
    if (primary === "en") return "en";
  }
  return defaultLocale;
}
