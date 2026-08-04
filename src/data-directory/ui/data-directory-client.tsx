"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { DirectoryPageSize } from "@/data-directory/server/query-contract";
import { AlertCircleIcon, InboxIcon, RotateCcwIcon, SearchIcon, SearchXIcon, XIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

import type {
  DataDirectoryColumnMeta,
  DataDirectoryCopy,
  DataDirectoryEnumFilter,
  DataDirectoryState,
  DataDirectoryTextFilter,
} from "./data-directory";

const LOADING_ROW_KEYS = ["first", "second", "third"] as const;

const SEARCH_DEBOUNCE_MS = 400;

function removeQueryParam(query: string, key: string, value?: string) {
  const params = new URLSearchParams(query);
  if (value === undefined) {
    params.delete(key);
  } else {
    const remaining = params.getAll(key).filter((entry) => entry !== value);
    params.delete(key);
    for (const entry of remaining) params.append(key, entry);
  }
  return params.toString();
}

function filterRemoveUrl(formAction: string, query: string, key: string, value?: string) {
  const without = removeQueryParam(query, key, value);
  return without ? `${formAction}?${without}` : formAction;
}

// Search input that submits its parent form after the user stops typing,
// and exposes a clear button to reset the query immediately.
function DebouncedSearch({
  defaultValue,
  formRef,
  id,
  label,
  placeholder,
}: Readonly<{
  defaultValue?: string;
  formRef: React.RefObject<HTMLFormElement | null>;
  id: string;
  label: string;
  placeholder?: string;
}>) {
  const [value, setValue] = useState(defaultValue ?? "");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const submit = useCallback(() => {
    formRef.current?.requestSubmit();
  }, [formRef]);

  function handleChange(next: string) {
    setValue(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(submit, SEARCH_DEBOUNCE_MS);
  }

  function handleClear() {
    setValue("");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(submit, 0);
  }

  return (
    <div className="relative">
      <Input
        data-ds-hit-target
        id={id}
        name="q"
        onChange={(event) => handleChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
      {value !== "" ? (
        <Button
          aria-label={label}
          className="absolute right-1 top-1/2 size-8 -translate-y-1/2 rounded-full p-0"
          onClick={handleClear}
          type="button"
          variant="ghost"
        >
          <XIcon aria-hidden className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

// Active filter chips rendered above the directory table so the administrator
// can see and remove applied filters without re-opening the filter bar.
function ActiveFilterChips({
  canonicalFilterQuery,
  filters,
  formAction,
  searchLabel,
  textFilters,
}: Readonly<{
  canonicalFilterQuery?: string;
  filters?: readonly DataDirectoryEnumFilter[];
  formAction: string;
  searchLabel: string;
  textFilters?: readonly DataDirectoryTextFilter[];
}>) {
  if (!canonicalFilterQuery) return null;
  const params = new URLSearchParams(canonicalFilterQuery);
  const entries = Array.from(params.entries());
  if (entries.length === 0) return null;

  const filterLabels = new Map<string, string>([
    ["q", searchLabel],
    ...(filters ?? []).map((filter) => [`filter.${filter.name}`, filter.label] as const),
    ...(textFilters ?? []).map((filter) => [`filter.${filter.name}`, filter.label] as const),
  ]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {entries.map(([key, value], index) => {
        const label = filterLabels.get(key) ?? key;
        return (
          <Badge
            asChild
            className="gap-1 pr-1.5"
            data-active-filter={key}
            key={`${key}-${value}-${index}`}
            variant="secondary"
          >
            <a
              className="inline-flex min-h-11 items-center"
              href={filterRemoveUrl(formAction, canonicalFilterQuery, key, value)}
            >
              <span className="max-w-[16rem] truncate">{label}: {value}</span>
              <XIcon aria-hidden className="size-3" />
            </a>
          </Badge>
        );
      })}
    </div>
  );
}

type PreparedRow = Readonly<{
  key: string;
  cells: readonly ReactNode[];
  actions?: ReactNode;
}>;

type DataDirectoryClientProps = Readonly<{
  idPrefix: string;
  state: DataDirectoryState;
  copy: DataDirectoryCopy;
  caption: string;
  columns: readonly DataDirectoryColumnMeta[];
  preparedRows: readonly PreparedRow[];
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
  actionsLabel?: string;
}>;

function DirectoryToolbar({
  action,
  canonicalFilterQuery,
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
  canonicalFilterQuery?: string;
  copy: DataDirectoryCopy;
  filters?: readonly DataDirectoryEnumFilter[];
  textFilters?: readonly DataDirectoryTextFilter[];
  pageSize?: DirectoryPageSize;
  pageSizes?: readonly DirectoryPageSize[];
  resetUrl: string;
  search?: string;
  idPrefix: string;
}>) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form action={action} className="flex flex-col gap-5" method="get" ref={formRef}>
      <FieldGroup className="grid gap-5 md:grid-cols-3">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-search`}>{copy.searchLabel}</FieldLabel>
          <DebouncedSearch
            defaultValue={search}
            formRef={formRef}
            id={`${idPrefix}-search`}
            label={copy.resetFilters}
            placeholder={copy.searchPlaceholder}
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
      <ActiveFilterChips
        canonicalFilterQuery={canonicalFilterQuery}
        filters={filters}
        formAction={action}
        searchLabel={copy.searchLabel}
        textFilters={textFilters}
      />
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

function DirectoryLoading({
  actionsLabel,
  caption,
  columns,
  copy,
}: Readonly<{
  actionsLabel?: string;
  caption: string;
  columns: readonly DataDirectoryColumnMeta[];
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

export function DataDirectoryClient(props: DataDirectoryClientProps) {
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
        canonicalFilterQuery={props.canonicalFilterQuery}
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
          actionsLabel={props.actionsLabel}
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
                  {props.actionsLabel ? <TableHead scope="col">{props.actionsLabel}</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.preparedRows.map((row) => (
                  <TableRow className="h-13" key={row.key}>
                    {row.cells.map((cell, index) => (
                      <TableCell className={props.columns[index]?.numeric ? "font-mono tabular-nums" : "whitespace-normal"} key={index}>
                        {cell}
                      </TableCell>
                    ))}
                    {props.actionsLabel ? <TableCell>{row.actions}</TableCell> : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-4 md:hidden">
            {props.preparedRows.map((row) => (
              <Card key={row.key}>
                <CardContent>
                  <dl className="grid gap-3">
                    {props.columns.map((column, index) => (
                      <div className="grid gap-1 border-b border-border pb-3 last:border-b-0 last:pb-0" key={column.id}>
                        <dt className="text-sm font-medium text-muted-foreground">{column.label}</dt>
                        <dd className={column.numeric ? "m-0 font-mono tabular-nums" : "m-0 break-words"}>{row.cells[index]}</dd>
                      </div>
                    ))}
                  </dl>
                  {row.actions ? <div className="mt-5">{row.actions}</div> : null}
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
