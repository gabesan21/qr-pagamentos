import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

export function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };
  return { copied, copy };
}

/** Truncated mono value with click-to-copy + "Copiado!" feedback (design.md §7). */
export function CopyField({
  value,
  truncate = true,
  className,
}: {
  value: string;
  truncate?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const { copied, copy } = useCopyToClipboard();
  return (
    <button
      type="button"
      onClick={() => void copy(value)}
      title={copied ? t("common.copied") : t("common.copy")}
      className={cn(
        "group inline-flex max-w-full items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-left transition-colors hover:border-accent",
        className,
      )}
    >
      <span className={cn("min-w-0 font-money text-xs text-text-2", truncate && "truncate")}>{value}</span>
      {copied ? (
        <Check className="size-3.5 shrink-0 text-success" aria-hidden />
      ) : (
        <Copy className="size-3.5 shrink-0 text-text-3 group-hover:text-accent" aria-hidden />
      )}
      <span className="sr-only">{copied ? t("common.copied") : t("common.copy")}</span>
    </button>
  );
}
