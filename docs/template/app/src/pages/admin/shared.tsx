import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "react-router";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { Order, OrderOrigin } from "@/mock/types";

/** Shared admin page animation. */
export const fadeUp = (i = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
});

export function orderOrigin(o: Order): OrderOrigin {
  return o.kind === "v2" ? "LINK" : (o.origin ?? "STANDALONE");
}

/** Generic mock query with loading / error / retry. */
export function useMockQuery<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    fetcher()
      .then((d) => {
        if (alive) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => load(), [load]);
  return { data, loading, error, retry: load };
}

/** Styled native select used inside FilterBar. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  allLabel: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-10 rounded-md border border-border bg-surface px-2.5 text-sm text-text",
        "focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--ring-color)]",
      )}
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** URL param helpers: validate once on mount + write while dropping page. */
export function useUrlFilters(valid: Record<string, readonly string[]>, onInvalid?: () => void) {
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    let bad = false;
    for (const [k, allowed] of Object.entries(valid)) {
      const v = params.get(k);
      if (v && !allowed.includes(v)) bad = true;
    }
    if (bad && onInvalid) onInvalid();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== "page") next.delete("page");
      setParams(next, { replace: true });
    },
    [params, setParams],
  );
  const clearAll = useCallback(() => {
    setParams(new URLSearchParams(), { replace: true });
  }, [setParams]);
  return { params, set, clearAll };
}

/** Segmented control with sliding indicator. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  ariaLabel,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  layoutId: string;
  ariaLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex gap-1 rounded-md bg-surface-2 p-1">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative rounded px-3 py-1.5 text-xs font-semibold transition-colors",
              selected ? "text-text" : "text-text-3 hover:text-text-2",
            )}
          >
            {selected && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded bg-surface shadow-card"
                transition={{ duration: 0.16 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Date-range (creation date) inputs bound to URL params `from`/`to`. */
export function DateRangeFilter({
  from,
  to,
  onFrom,
  onTo,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  const { t } = useI18n();
  return (
    <span className="flex items-center gap-1.5 text-xs text-text-2">
      <label className="flex items-center gap-1">
        <span>{t("common.from")}</span>
        <input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className={inputCls} aria-label={t("common.from")} />
      </label>
      <label className="flex items-center gap-1">
        <span>{t("common.to")}</span>
        <input type="date" value={to} onChange={(e) => onTo(e.target.value)} className={inputCls} aria-label={t("common.to")} />
      </label>
    </span>
  );
}

/** Small inline field with label + optional error for admin forms. */
export function AdminField({
  label,
  error,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-text">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && !error && <p className="mt-1 text-xs text-text-3">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

export const inputCls = cn(
  "h-10 rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-text-3",
  "focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--ring-color)]",
);

export const cardCls = "rounded-card border border-border bg-surface p-5 shadow-card";
