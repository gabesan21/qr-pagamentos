import { useLocation } from "react-router";
import { Construction } from "lucide-react";
import { useI18n } from "@/i18n";

/** Placeholder for routes owned by page agents. */
export default function PageStub() {
  const { t } = useI18n();
  const location = useLocation();
  return (
    <div className="mx-auto mt-16 max-w-md rounded-card border border-border bg-surface p-8 text-center shadow-card">
      <Construction className="mx-auto size-8 text-accent" aria-hidden />
      <h2 className="mt-3 font-display text-lg font-semibold text-text">{t("common.comingSoon")}</h2>
      <p className="mt-1 text-sm text-text-2">{t("common.comingSoonBody")}</p>
      <p className="mt-3 font-money text-xs text-text-3">{location.pathname}</p>
    </div>
  );
}
