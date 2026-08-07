import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type MoneyTextProps = Readonly<{
  className?: string;
  pairLabel?: string;
  size?: "default" | "large";
  value: string;
}>;

/** Displays an already formatted exact amount without parsing or arithmetic. */
export function MoneyText({ className, pairLabel, size = "default", value }: MoneyTextProps) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span
        className={cn(
          "font-mono font-medium tabular-nums",
          size === "large" && "text-2xl leading-7 font-semibold",
        )}
      >
        {value}
      </span>
      {pairLabel ? <Badge variant="secondary">{pairLabel}</Badge> : null}
    </span>
  );
}
