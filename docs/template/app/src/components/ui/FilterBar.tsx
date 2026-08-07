import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { useSearchParams } from "react-router";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { Button } from "./button";

export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

/** Row above tables: debounced clearable search + filter slots + removable active-filter chips. URL-synced via `searchParam`. */
export function FilterBar({
  searchParam = "q",
  searchPlaceholder,
  children,
  chips = [],
  onClearAll,
  className,
}: {
  searchParam?: string;
  searchPlaceholder?: string;
  /** Filter selects / date-range pickers. */
  children?: ReactNode;
  chips?: FilterChip[];
  onClearAll?: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const urlValue = params.get(searchParam) ?? "";
  const [value, setValue] = useState(urlValue);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setValue(urlValue), [urlValue]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const commit = (v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(searchParam, v);
    else next.delete(searchParam);
    next.delete("page");
    setParams(next, { replace: true });
  };

  const onChange = (v: string) => {
    setValue(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(v), 350);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3" aria-hidden />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={searchPlaceholder ?? t("common.search")}
            aria-label={t("common.search")}
            className={cn(
              "h-10 w-full rounded-md border border-border bg-surface pl-9 pr-8 text-sm text-text placeholder:text-text-3",
              "focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--ring-color)]",
            )}
          />
          {value && (
            <button
              type="button"
              aria-label={t("common.close")}
              onClick={() => onChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-3 hover:text-text"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
        {children}
        {(chips.length > 0 || value) && onClearAll && (
          <Button variant="ghost" size="sm" onClick={onClearAll}>
            {t("common.clearFilters")}
          </Button>
        )}
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label={t("common.activeFilters")}>
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1.5 rounded-pill bg-accent-soft px-2.5 py-1 text-xs font-medium text-text"
            >
              {chip.label}
              <button type="button" onClick={chip.onRemove} aria-label={`${t("common.close")} ${chip.label}`} className="rounded-full hover:text-danger">
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
