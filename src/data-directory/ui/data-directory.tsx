import type { ReactNode } from "react";

import type { DirectoryPageSize } from "@/data-directory/server/query-contract";
import { AlertCircleIcon, InboxIcon, RotateCcwIcon, SearchIcon, SearchXIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const LOADING_ROW_KEYS = ["first", "second", "third"] as const;

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
  pageSize?: DirectoryPageSize;
  pageSizes?: readonly DirectoryPageSize[];
  filters?: readonly DataDirectoryEnumFilter[];
  textFilters?: readonly DataDirectoryTextFilter[];
  emptyAction?: Readonly<{ href: string; label: string }>;
  getRowActions?: (row: Row) => ReactNode;
  actionsLabel?: string;
}>;

function DirectoryToolbar({
  action,
  copy,
  filters = [],
  textFilters = [],
  pageSize = 25,
  pageSizes = [25, 50, 100],
  resetUrl,
  search,
  idPrefix,
}: Readonly<{
  action: string;
  copy: DataDirectoryCopy;
  filters?: readonly DataDirectoryEnumFilter[];
  textFilters?: readonly DataDirectoryTextFilter[];
  pageSize?: DirectoryPageSize;
  pageSizes?: readonly DirectoryPageSize[];
  resetUrl: string;
  search?: string;
  idPrefix: string;
}>) {
  return (
    <form action={action} className="flex flex-col gap-5" method="get">
      <FieldGroup className="grid gap-5 md:grid-cols-3">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-search`}>{copy.searchLabel}</FieldLabel>
          <Input
            data-ds-hit-target
            defaultValue={search}
            id={`${idPrefix}-search`}
            name="q"
            placeholder={copy.searchPlaceholder}
            type="search"
          />
        </Field>
        {filters.map((filter) => (
          <Field key={filter.name}>
            <FieldLabel htmlFor={`${idPrefix}-filter-${filter.name}`}>{filter.label}</FieldLabel>
            <NativeSelect
              data-ds-hit-target
              defaultValue={filter.selected ?? ""}
              id={`${idPrefix}-filter-${filter.name}`}
              name={`filter.${filter.name}`}
            >
              <NativeSelectOption value="">{filter.allLabel}</NativeSelectOption>
              {filter.options.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        ))}
        {textFilters.map((filter) => (
          <Field key={filter.name}>
            <FieldLabel htmlFor={`${idPrefix}-filter-${filter.name}`}>{filter.label}</FieldLabel>
            <Input
              data-ds-hit-target
              defaultValue={filter.selected}
              id={`${idPrefix}-filter-${filter.name}`}
              name={`filter.${filter.name}`}
              placeholder={filter.placeholder}
              type={filter.calendarDay ? "date" : "text"}
            />
          </Field>
        ))}
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-page-size`}>{copy.pageSizeLabel}</FieldLabel>
          <NativeSelect data-ds-hit-target defaultValue={String(pageSize)} id={`${idPrefix}-page-size`} name="pageSize">
            {pageSizes.map((size) => (
              <NativeSelectOption key={size} value={String(size)}>{size}</NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </FieldGroup>
      <div className="flex flex-wrap gap-3">
        <Button data-ds-hit-target type="submit"><SearchIcon data-icon="inline-start" />{copy.applyFilters}</Button>
        <Button asChild data-ds-hit-target variant="outline">
          <a href={resetUrl}><RotateCcwIcon data-icon="inline-start" />{copy.resetFilters}</a>
        </Button>
      </div>
    </form>
  );
}

function StateCard({
  action,
  description,
  state,
  title,
}: Readonly<{
  action?: Readonly<{ href: string; label: string }>;
  description: string;
  state: Exclude<DataDirectoryState, "ready" | "loading">;
  title: string;
}>) {
  const destructive = state === "invalid-query" || state === "error";
  if (destructive) {
    return (
      <Alert data-directory-state={state} variant="destructive">
        <AlertCircleIcon aria-hidden />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="flex flex-col gap-4">
          <span>{description}</span>
          {action ? <Button asChild data-ds-hit-target variant="outline"><a href={action.href}>{action.label}</a></Button> : null}
        </AlertDescription>
      </Alert>
    );
  }

  const EmptyIcon = state === "filtered-empty" ? SearchXIcon : InboxIcon;

  return (
    <Empty data-directory-state={state}>
      <EmptyHeader>
        <EmptyMedia variant="icon"><EmptyIcon aria-hidden /></EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? (
        <EmptyContent>
          <Button asChild data-ds-hit-target variant="outline"><a href={action.href}>{action.label}</a></Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

function DirectoryLoading<Row>({
  actionsLabel,
  caption,
  columns,
  copy,
}: Readonly<{
  actionsLabel?: string;
  caption: string;
  columns: readonly DataDirectoryColumn<Row>[];
  copy: DataDirectoryCopy;
}>) {
  return (
    <div aria-live="polite" className="flex flex-col gap-4" data-directory-state="loading" role="status">
      <div className="flex flex-col gap-1">
        <span>{copy.loading}</span>
        <span className="text-sm text-muted-foreground">{copy.loadingDescription}</span>
      </div>
      <div className="hidden min-w-0 md:block">
        <Table>
          <TableCaption>{caption}</TableCaption>
          <TableHeader>
            <TableRow>
              {columns.map((column) => <TableHead scope="col" key={column.id}>{column.label}</TableHead>)}
              {actionsLabel ? <TableHead scope="col">{actionsLabel}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody aria-hidden>
            {LOADING_ROW_KEYS.map((rowKey) => (
              <TableRow className="h-13" key={rowKey}>
                {columns.map((column) => (
                  <TableCell key={column.id}><Skeleton className="h-4 w-full max-w-32" /></TableCell>
                ))}
                {actionsLabel ? <TableCell><Skeleton className="h-11 w-24" /></TableCell> : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div aria-hidden className="flex flex-col gap-4 md:hidden">
        {LOADING_ROW_KEYS.map((rowKey) => (
          <Card key={rowKey}>
            <CardContent className="flex flex-col gap-3">
              {columns.map((column) => <Skeleton className="h-4 w-full" key={column.id} />)}
              {actionsLabel ? <Skeleton className="h-11 w-24" /> : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function DirectoryPagination({
  copy,
  nextUrl,
  previousUrl,
}: Readonly<{
  copy: DataDirectoryCopy;
  nextUrl?: string;
  previousUrl?: string;
}>) {
  if (!previousUrl && !nextUrl) {
    return null;
  }

  return (
    <Pagination className="justify-start" label={copy.paginationLabel}>
      <PaginationContent className="w-full">
        {previousUrl ? (
          <PaginationItem>
            <PaginationPrevious
              data-ds-hit-target
              href={previousUrl}
              label={copy.previousPage}
              text={copy.previousPage}
            />
          </PaginationItem>
        ) : null}
        {nextUrl ? (
          <PaginationItem className="ml-auto">
            <PaginationNext
              data-ds-hit-target
              href={nextUrl}
              label={copy.nextPage}
              text={copy.nextPage}
            />
          </PaginationItem>
        ) : null}
      </PaginationContent>
    </Pagination>
  );
}

export function DataDirectory<Row>(props: DataDirectoryProps<Row>) {
  const stateAction = props.state === "filtered-empty" || props.state === "invalid-query"
    ? { href: props.resetUrl, label: props.copy.resetFilters }
    : props.state === "error"
      ? { href: props.retryUrl ?? props.resetUrl, label: props.copy.retry }
      : props.state === "empty"
        ? props.emptyAction
        : undefined;

  return (
    <section aria-busy={props.state === "loading" ? true : undefined} className="flex min-w-0 flex-col gap-6" data-data-directory>
      <DirectoryToolbar
        action={props.formAction}
        copy={props.copy}
        filters={props.filters}
        idPrefix={props.idPrefix}
        pageSize={props.pageSize}
        pageSizes={props.pageSizes}
        resetUrl={props.resetUrl}
        search={props.search}
        textFilters={props.textFilters}
      />
      <Separator />
      {props.state === "loading" ? (
        <DirectoryLoading
          actionsLabel={props.getRowActions ? props.actionsLabel : undefined}
          caption={props.caption}
          columns={props.columns}
          copy={props.copy}
        />
      ) : null}
      {props.state === "empty" ? (
        <StateCard action={stateAction} description={props.copy.emptyDescription} state="empty" title={props.copy.empty} />
      ) : null}
      {props.state === "filtered-empty" ? (
        <StateCard action={stateAction} description={props.copy.filteredEmptyDescription} state="filtered-empty" title={props.copy.filteredEmpty} />
      ) : null}
      {props.state === "invalid-query" ? (
        <StateCard action={stateAction} description={props.copy.invalidDescription} state="invalid-query" title={props.copy.invalid} />
      ) : null}
      {props.state === "error" ? (
        <StateCard action={stateAction} description={props.copy.errorDescription} state="error" title={props.copy.error} />
      ) : null}
      {props.state === "ready" ? (
        <>
          <div className="hidden min-w-0 md:block" role="region" aria-label={props.caption}>
            <Table>
              <TableCaption>{props.caption}</TableCaption>
              <TableHeader>
                <TableRow>
                  {props.columns.map((column) => <TableHead scope="col" key={column.id}>{column.label}</TableHead>)}
                  {props.getRowActions && props.actionsLabel ? <TableHead scope="col">{props.actionsLabel}</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.rows.map((row) => (
                  <TableRow className="h-13" key={props.rowKey(row)}>
                    {props.columns.map((column) => (
                      <TableCell className={column.numeric ? "font-mono tabular-nums" : "whitespace-normal"} key={column.id}>
                        {column.value(row)}
                      </TableCell>
                    ))}
                    {props.getRowActions ? <TableCell>{props.getRowActions(row)}</TableCell> : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-4 md:hidden">
            {props.rows.map((row) => (
              <Card key={props.rowKey(row)}>
                <CardContent>
                  <dl className="grid gap-3">
                    {props.columns.map((column) => (
                      <div className="grid gap-1 border-b border-border pb-3 last:border-b-0 last:pb-0" key={column.id}>
                        <dt className="text-sm font-medium text-muted-foreground">{column.label}</dt>
                        <dd className={column.numeric ? "m-0 font-mono tabular-nums" : "m-0 break-words"}>{column.value(row)}</dd>
                      </div>
                    ))}
                  </dl>
                  {props.getRowActions ? <div className="mt-5">{props.getRowActions(row)}</div> : null}
                </CardContent>
              </Card>
            ))}
          </div>
          <DirectoryPagination copy={props.copy} nextUrl={props.nextUrl} previousUrl={props.previousUrl} />
        </>
      ) : null}
    </section>
  );
}
