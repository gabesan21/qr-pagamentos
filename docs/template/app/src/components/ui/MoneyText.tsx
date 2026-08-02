import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { Money } from "@/mock/types";

/** Exact-decimal money in IBM Plex Mono tabular figures, with currency label. */
export function MoneyText({
  money,
  size = "md",
  showPair = false,
  className,
}: {
  money: Money;
  size?: "md" | "lg";
  showPair?: boolean;
  className?: string;
}) {
  const { formatMoney } = useI18n();
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className={cn("font-money", size === "lg" ? "text-[22px] leading-7 font-semibold" : "text-sm leading-5 font-medium")}>
        {formatMoney(money.amount, money.currency)}
      </span>
      {showPair && (
        <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-2">
          {money.currency} / PIX
        </span>
      )}
    </span>
  );
}
