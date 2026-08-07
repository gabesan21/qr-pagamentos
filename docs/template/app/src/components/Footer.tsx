import { Globe } from "lucide-react";
import { useI18n } from "@/i18n";
import { LOCALES } from "@/i18n";

/** Shared language switcher (globe + locale code). */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5 text-xs font-medium text-text-2">
      <Globe className="size-3.5 text-text-3" aria-hidden />
      <span className="sr-only">{t("nav.language")}</span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as typeof locale)}
        aria-label={t("nav.language")}
        className="cursor-pointer bg-transparent text-xs font-medium text-text-2 focus:outline-none"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {compact ? (l === "pt-BR" ? "PT" : "EN") : l === "pt-BR" ? "PT-BR" : "EN"}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Checkout/auth footer: powered-by + privacy + language switcher (design.md §6.2). */
export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="flex flex-col items-center gap-3 border-t border-border px-6 py-5 text-center">
      <div className="flex items-center gap-4">
        <span className="text-xs text-text-3">{t("checkout.poweredBy")}</span>
        <LanguageSwitcher compact />
      </div>
      <a href="#" className="text-xs text-text-3 underline-offset-2 hover:text-text-2 hover:underline">
        {t("checkout.privacy")}
      </a>
    </footer>
  );
}
