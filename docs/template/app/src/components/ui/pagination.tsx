import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

/** DataTable footer pagination: page-size select, "1–25 of 342", prev/next + page numbers. */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
}: {
  page: number; // 1-based
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}) {
  const { t } = useI18n();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(page, pageCount);
  const from = total === 0 ? 0 : (clamped - 1) * pageSize + 1;
  const to = Math.min(clamped * pageSize, total);

  const pages: number[] = [];
  const start = Math.max(1, Math.min(clamped - 2, pageCount - 4));
  for (let p = start; p <= Math.min(pageCount, start + 4); p++) pages.push(p);

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-xs text-text-2">
      {onPageSizeChange && (
        <label className="flex items-center gap-2">
          <span>{t("common.rowsPerPage")}</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-text focus:border-accent focus:outline-none"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
      <span className="ml-auto font-money">
        {from}–{to} {t("common.of")} {total}
      </span>
      <div className="flex items-center gap-1">
        <PageButton disabled={clamped <= 1} onClick={() => onPageChange(clamped - 1)} label={t("common.previous")}>
          <ChevronLeft className="size-4" aria-hidden />
        </PageButton>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            aria-current={p === clamped ? "page" : undefined}
            className={cn(
              "h-8 min-w-8 rounded-md px-2 font-money text-xs",
              p === clamped ? "bg-accent text-accent-fg" : "text-text-2 hover:bg-surface-2",
            )}
          >
            {p}
          </button>
        ))}
        <PageButton disabled={clamped >= pageCount} onClick={() => onPageChange(clamped + 1)} label={t("common.next")}>
          <ChevronRight className="size-4" aria-hidden />
        </PageButton>
      </div>
    </div>
  );
}

function PageButton({
  disabled,
  onClick,
  label,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-md text-text-2 hover:bg-surface-2 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
