import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { Button } from "./button";
import { EmptyState } from "./EmptyState";
import type { EmptyIllustration } from "./EmptyState";
import { TableSkeleton } from "./Skeletons";
import { Pagination } from "./pagination";

export interface Column<T> {
  key: string;
  header: string;
  /** Render the cell; keep IDs/amounts in `font-money`. */
  render: (row: T) => ReactNode;
  mono?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  /** "empty" (no data) vs "filtered" (filters produced nothing) */
  emptyVariant?: "empty" | "filtered";
  emptyIllustration?: EmptyIllustration;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: ReactNode;
  onClearFilters?: () => void;
  error?: boolean;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

/** Sticky-header dense data table (design.md §7). States: loading / empty / filtered-empty / error+retry. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyVariant = "empty",
  emptyIllustration = "orders",
  emptyTitle,
  emptyBody,
  emptyAction,
  onClearFilters,
  error = false,
  onRetry,
  onRowClick,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: DataTableProps<T>) {
  const { t } = useI18n();

  if (loading) return <TableSkeleton columns={columns.length} />;

  const showPagination = page !== undefined && pageSize !== undefined && total !== undefined && onPageChange;

  let stateContent: ReactNode = null;
  if (error) {
    stateContent = (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <p className="text-sm text-text-2">{t("common.requestError")}</p>
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            {t("common.retry")}
          </Button>
        )}
      </div>
    );
  } else if (rows.length === 0) {
    stateContent = (
      <EmptyState
        illustration={emptyIllustration}
        title={
          emptyTitle ?? (emptyVariant === "filtered" ? t("common.noResultsFiltered") : t("empty.orders.title"))
        }
        body={emptyBody}
        action={
          emptyVariant === "filtered" && onClearFilters ? (
            <Button variant="secondary" onClick={onClearFilters}>
              {t("common.clearFilters")}
            </Button>
          ) : (
            emptyAction
          )
        }
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="sticky top-0 bg-surface-2">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-text-3",
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stateContent ? (
              <tr>
                <td colSpan={columns.length}>{stateContent}</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "h-[52px] border-t border-border transition-colors hover:bg-surface-2",
                    onRowClick && "cursor-pointer",
                  )}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-3.5 py-2.5 text-text", c.mono && "font-money", c.className)}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {showPagination && !stateContent && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </div>
  );
}
