import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

/** Inline version of public/logo.svg — currentColor, themeable (design.md §11). */
export function Logo({ glyphOnly = false, className }: { glyphOnly?: boolean; className?: string }) {
  const { t } = useI18n();
  if (glyphOnly) {
    return (
      <svg viewBox="0 0 32 32" className={cn("size-8 text-accent", className)} role="img" aria-label={t("app.name")} fill="currentColor">
        <Glyph />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 160 32" className={cn("h-8 w-auto text-text", className)} role="img" aria-label={t("app.name")}>
      <g fill="var(--accent)">
        <Glyph />
      </g>
      <text x="40" y="22" fontFamily="Sora, sans-serif" fontWeight={700} fontSize={15} letterSpacing="-0.3" fill="currentColor">
        QR Pagamentos
      </text>
    </svg>
  );
}

function Glyph() {
  return (
    <>
      <path fillRule="evenodd" d="M0 0h12v12H0zM3 3v6h6V3z" />
      <path fillRule="evenodd" d="M20 0h12v12H20zM23 3v6h6V3z" />
      <path fillRule="evenodd" d="M0 20h12v12H0zM3 23v6h6v-6z" />
      <rect x="16" y="4" width="3" height="3" />
      <rect x="4" y="16" width="3" height="3" />
      <rect x="10" y="16" width="3" height="3" />
      <rect x="16" y="16" width="3" height="3" />
      <rect x="22" y="16" width="3" height="3" />
      <rect x="16" y="22" width="3" height="3" />
      <rect x="16" y="28" width="3" height="3" />
      <rect x="28" y="22" width="3" height="3" />
      <rect x="28" y="28" width="3" height="3" />
    </>
  );
}
