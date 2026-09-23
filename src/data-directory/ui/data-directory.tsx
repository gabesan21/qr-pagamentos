import type { ReactNode } from "react";

import type { DirectoryPageSize } from "@/data-directory/server/query-contract";

import { DataDirectoryClient } from "./data-directory-client";

export type DataDirectoryState =
  | "ready"
  | "loading"
  | "empty"
  | "filtered-empty"
  | "invalid-query"
  | "error";

export type DataDirectoryCopy = Readonly<{
  searchLabel: string;
  searchPlaceholder: string;
  pageSizeLabel: string;
  applyFilters: string;
  resetFilters: string;
  // Optional so existing per-page copy builders that predate the ghost
  // "Clear filters" action keep compiling; falls back to `resetFilters`.
  clearFilters?: string;
  previousPage: string;
  nextPage: string;
  paginationLabel: string;
  loading: string;
  loadingDescription: string;
  empty: string;
  emptyDescription: string;
  filteredEmpty: string;
  filteredEmptyDescription: string;
  invalid: string;
  invalidDescription: string;
  error: string;
  errorDescription: string;
  retry: string;
}>;

export type DataDirectoryColumn<Row> = Readonly<{
  id: string;
  label: string;
  value: (row: Row) => ReactNode;
  numeric?: boolean;
}>;

// Serializable column metadata passed to the client shell; the value renderer
// stays on the server so the row projection never crosses the boundary.
export type DataDirectoryColumnMeta = Readonly<{
  id: string;
  label: string;
  numeric?: boolean;
}>;

export type DataDirectoryEnumFilter = Readonly<{
  name: string;
  label: string;
  allLabel: string;
  selected?: string;
  options: readonly Readonly<{ value: string; label: string }>[];
}>;

// Generic labelled free-text filter; `calendarDay` renders the native date
// control for exact `YYYY-MM-DD` bounds. Registered per directory, never
// hardcoded to a concrete projection.
export type DataDirectoryTextFilter = Readonly<{
  name: string;
  label: string;
  selected?: string;
  placeholder?: string;
  calendarDay?: boolean;
}>;

type DataDirectoryProps<Row> = Readonly<{
  idPrefix: string;
  state: DataDirectoryState;
  copy: DataDirectoryCopy;
  caption: string;
  columns: readonly DataDirectoryColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  formAction: string;
  resetUrl: string;
  retryUrl?: string;
  previousUrl?: string;
  nextUrl?: string;
  search?: string;
  canonicalFilterQuery?: string;
  pageSize?: DirectoryPageSize;
  pageSizes?: readonly DirectoryPageSize[];
  filters?: readonly DataDirectoryEnumFilter[];
  textFilters?: readonly DataDirectoryTextFilter[];
  emptyAction?: Readonly<{ href: string; label: string }>;
  getRowActions?: (row: Row) => ReactNode;
  actionsLabel?: string;
  // Optional server-evaluated row link; resolved here alongside `cells` and
  // `actions` so no row projection crosses the server/client boundary.
  getRowHref?: (row: Row) => string | undefined;
  // Documented opt-out for non-navigating demo surfaces (the design-system
  // gallery): renders the same composition with no live URL commit. Defaults
  // to the live URL-state controller.
  interactive?: boolean;
}>;

// The directory surface is split into a server wrapper and a client shell:
// the wrapper evaluates row projections (value / rowKey / getRowActions) so
// only serializable React nodes cross the server/client boundary, while the
// client shell owns the interactive toolbar.
export function DataDirectory<Row>(props: DataDirectoryProps<Row>) {
  const preparedRows = props.rows.map((row) => ({
    key: props.rowKey(row),
    cells: props.columns.map((column) => column.value(row)),
    actions: props.getRowActions ? props.getRowActions(row) : undefined,
    href: props.getRowHref ? props.getRowHref(row) : undefined,
  }));

  return (
    <DataDirectoryClient
      actionsLabel={props.actionsLabel}
      canonicalFilterQuery={props.canonicalFilterQuery}
      caption={props.caption}
      columns={props.columns.map(({ id, label, numeric }) => ({ id, label, numeric }))}
      copy={props.copy}
      emptyAction={props.emptyAction}
      filters={props.filters}
      formAction={props.formAction}
      idPrefix={props.idPrefix}
      interactive={props.interactive}
      nextUrl={props.nextUrl}
      pageSize={props.pageSize}
      pageSizes={props.pageSizes}
      preparedRows={preparedRows}
      previousUrl={props.previousUrl}
      resetUrl={props.resetUrl}
      retryUrl={props.retryUrl}
      search={props.search}
      state={props.state}
      textFilters={props.textFilters}
    />
  );
}
