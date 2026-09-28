"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";

import type { DirectoryPageSize } from "@/data-directory/server/query-contract";
import { AlertCircleIcon, ChevronDownIcon, InboxIcon, RotateCcwIcon, SearchIcon, SearchXIcon, XIcon } from "lucide-react";

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
  DataDirectoryCompactToolbar,
  DataDirectoryEnumFilter,
  DataDirectoryState,
  DataDirectoryTextFilter,
} from "./data-directory";

const LOADING_ROW_KEYS = ["first", "second", "third"] as const;

const SEARCH_DEBOUNCE_MS = 350;

const ADDITIONAL_FILTER_GRID_CLASS = "mt-4 grid gap-4 border-t border-border pt-4 md:col-span-3 md:mt-0 md:border md:border-border md:bg-surface md:p-4 md:pt-4";

const INTERACTIVE_DESCENDANT_SELECTOR = "a, button, input, select, textarea, label, [role]";

// Bounded to `boundary` (the row itself): an unbounded `target.closest(...)`
// climbs past the row into ancestors — the desktop table's own
// `role="region"` wrapper matches `[role]` — and would treat every row click
// as landing on an interactive descendant, never navigating.
function isInteractiveDescendant(target: EventTarget | null, boundary: Element) {
  if (!(target instanceof Element)) return false;
  const match = target.closest(INTERACTIVE_DESCENDANT_SELECTOR);
  return match !== null && boundary.contains(match);
}

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

function withPageSize(query: string, pageSize?: DirectoryPageSize) {
  if (pageSize === undefined) return query;
  const params = new URLSearchParams(query);
  params.set("pageSize", String(pageSize));
  return params.toString();
}

function filterRemoveUrl(
  formAction: string,
  query: string,
  key: string,
  value: string | undefined,
  pageSize: DirectoryPageSize | undefined,
) {
  const without = withPageSize(removeQueryParam(query, key, value), pageSize);
  return without ? `${formAction}?${without}` : formAction;
}

// Builds the canonical commit query from the live form state: keeps `q`, the
// registered `filter.*` pairs and the selected page size, and never reads or
// emits `cursor` (the field does not exist in this form).
function buildCommitQuery(form: HTMLFormElement, filterNames: readonly string[]) {
  const data = new FormData(form);
  const params = new URLSearchParams();
  const q = (data.get("q") as string | null)?.trim();
  if (q) params.set("q", q);
  for (const name of filterNames) {
    for (const raw of data.getAll(`filter.${name}`)) {
      const value = String(raw).trim();
      if (value !== "") params.append(`filter.${name}`, value);
    }
  }
  const pageSize = data.get("pageSize");
  if (pageSize !== null && String(pageSize) !== "") params.set("pageSize", String(pageSize));
  return params.toString();
}

function chipValueLabel(
  key: string,
  value: string,
  searchLabel: string,
  filters?: readonly DataDirectoryEnumFilter[],
  textFilters?: readonly DataDirectoryTextFilter[],
) {
  if (key === "q") return { label: searchLabel, value };
  const name = key.startsWith("filter.") ? key.slice("filter.".length) : key;
  const enumFilter = filters?.find((filter) => filter.name === name);
  if (enumFilter) {
    const option = enumFilter.options.find((candidate) => candidate.value === value);
    return { label: enumFilter.label, value: option?.label ?? value };
  }
  const textFilter = textFilters?.find((filter) => filter.name === name);
  return { label: textFilter?.label ?? key, value };
}

// Search input that commits after the caller-provided delay once the user
// stops typing, and exposes a clear button that commits immediately.
function DebouncedSearch({
  defaultValue,
  id,
  label,
  onCommit,
  placeholder,
}: Readonly<{
  defaultValue?: string;
  id: string;
  label: string;
  onCommit: () => void;
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

  function handleChange(next: string) {
    setValue(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(onCommit, SEARCH_DEBOUNCE_MS);
  }

  function handleClear() {
    setValue("");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    // Deferred one tick so the cleared value is present in the form before
    // the commit reads it.
    timeoutRef.current = setTimeout(onCommit, 0);
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
          className="absolute right-1 top-1/2 -translate-y-1/2"
          onClick={handleClear}
          type="button"
          size="icon-row"
          variant="ghost"
        >
          <XIcon aria-hidden className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

// Active filter chips rendered above the directory table so the caller can
// see and remove applied filters without re-opening the filter bar. Values
// resolve through the registered enum options; raw enum ids are never shown.
function ActiveFilterChips({
  canonicalFilterQuery,
  filters,
  formAction,
  pageSize,
  searchLabel,
  textFilters,
}: Readonly<{
  canonicalFilterQuery?: string;
  filters?: readonly DataDirectoryEnumFilter[];
  formAction: string;
  pageSize?: DirectoryPageSize;
  searchLabel: string;
  textFilters?: readonly DataDirectoryTextFilter[];
}>) {
  if (!canonicalFilterQuery) return null;
  const params = new URLSearchParams(canonicalFilterQuery);
  const entries = Array.from(params.entries());
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {entries.map(([key, value], index) => {
        const { label, value: resolvedValue } = chipValueLabel(key, value, searchLabel, filters, textFilters);
        return (
          <Badge
            asChild
            className="gap-1 pr-1.5"
            data-active-filter={key}
            key={`${key}-${value}-${index}`}
            variant="secondary"
          >
            <a
              className="inline-flex min-h-(--control-default-height) items-center"
              href={filterRemoveUrl(formAction, canonicalFilterQuery, key, value, pageSize)}
            >
              <span className="max-w-(--directory-filter-chip-max-width) truncate">{label}: {resolvedValue}</span>
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
  href?: string;
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
  interactive?: boolean;
  compactToolbar?: DataDirectoryCompactToolbar;
}>;

function DirectoryToolbar({
  canonicalFilterQuery,
  compactToolbar,
  copy,
  filters = [],
  formAction,
  formId,
  formRef,
  hasChips,
  interactive,
  onCommit,
  onFieldChange,
  pageSize,
  resetUrl,
  search,
  textFilters = [],
  idPrefix,
}: Readonly<{
  canonicalFilterQuery?: string;
  compactToolbar?: DataDirectoryCompactToolbar;
  copy: DataDirectoryCopy;
  filters?: readonly DataDirectoryEnumFilter[];
  formAction: string;
  formId: string;
  formRef: RefObject<HTMLFormElement | null>;
  hasChips: boolean;
  interactive: boolean;
  onCommit: () => void;
  onFieldChange: (event: ChangeEvent<HTMLFormElement>) => void;
  pageSize?: DirectoryPageSize;
  resetUrl: string;
  search?: string;
  textFilters?: readonly DataDirectoryTextFilter[];
  idPrefix: string;
}>) {
  const isCompact = compactToolbar !== undefined;
  const visibleFilterNames = new Set(compactToolbar?.visibleFilterNames);
  const visibleFilters = isCompact ? filters.filter((filter) => visibleFilterNames.has(filter.name)) : filters;
  const additionalFilters = isCompact ? filters.filter((filter) => !visibleFilterNames.has(filter.name)) : [];
  const dateFilters = textFilters.filter((filter) => filter.calendarDay);
  const otherTextFilters = textFilters.filter((filter) => !filter.calendarDay);
  const additionalFilterGridClassName = compactToolbar?.additionalFiltersDesktopColumns === 3
    ? `${ADDITIONAL_FILTER_GRID_CLASS} md:grid-cols-3`
    : ADDITIONAL_FILTER_GRID_CLASS;
  const dateFilterGridClassName = compactToolbar?.additionalFiltersDesktopColumns === 3
    ? "grid gap-4 md:col-span-full md:grid-cols-2"
    : "grid gap-4 md:col-span-2 md:grid-cols-2";
  const additionalFilterActiveCount = Array.from(new URLSearchParams(canonicalFilterQuery).keys())
    .filter((key) => key.startsWith("filter.") && !visibleFilterNames.has(key.slice("filter.".length))).length;

  const renderEnumFilter = (filter: DataDirectoryEnumFilter) => (
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
  );
  const renderTextFilter = (filter: DataDirectoryTextFilter) => (
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
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5"
      id={formId}
      method="get"
      onChange={interactive ? onFieldChange : undefined}
      ref={formRef}
    >
      <FieldGroup className={isCompact ? "grid gap-4 min-[360px]:grid-cols-2 md:grid-cols-[minmax(0,1fr)_minmax(var(--directory-toolbar-filter-min-width),0.45fr)_auto]" : "grid gap-5 md:grid-cols-3"}>
        <Field className={isCompact ? "min-[360px]:col-span-2 md:col-span-1" : undefined}>
          <FieldLabel htmlFor={`${idPrefix}-search`}>{copy.searchLabel}</FieldLabel>
          <DebouncedSearch
            defaultValue={search}
            id={`${idPrefix}-search`}
            label={copy.resetFilters}
            onCommit={interactive ? onCommit : noop}
            placeholder={copy.searchPlaceholder}
          />
        </Field>
        {visibleFilters.map(renderEnumFilter)}
        {!isCompact ? textFilters.map(renderTextFilter) : null}
        {isCompact && (additionalFilters.length > 0 || textFilters.length > 0) ? (
          <details className="group min-[360px]:contents min-[360px]:[&::details-content]:col-span-full">
            <summary className="flex min-h-(--control-default-height) cursor-pointer list-none items-center justify-between gap-3 rounded-(--control-radius) bg-surface-2 px-(--control-padding-inline) text-(length:--control-field-text-size) font-medium text-text marker:content-none focus-visible:ring-3 focus-visible:ring-ring min-[360px]:self-end md:min-w-44">
              <span className="flex items-center gap-2">
                {copy.additionalFilters ?? copy.applyFilters}
                <Badge aria-label={(copy.additionalFiltersActive ?? "{count}").replace("{count}", String(additionalFilterActiveCount))} variant="secondary">{additionalFilterActiveCount}</Badge>
              </span>
              <ChevronDownIcon aria-hidden className="size-4 transition-transform group-open:rotate-180" />
            </summary>
            <FieldGroup className={additionalFilterGridClassName}>
              {additionalFilters.map(renderEnumFilter)}
              {otherTextFilters.map(renderTextFilter)}
              {dateFilters.length > 0 ? (
                <fieldset className={dateFilterGridClassName}>
                  <legend className="mb-1 text-sm font-medium text-text">{copy.creationPeriod ?? copy.additionalFilters ?? copy.applyFilters}</legend>
                  {dateFilters.map(renderTextFilter)}
                </fieldset>
              ) : null}
            </FieldGroup>
          </details>
        ) : null}
      </FieldGroup>
      {hasChips && isCompact ? (
        <div className="flex flex-wrap items-center gap-3">
          <ActiveFilterChips
            canonicalFilterQuery={canonicalFilterQuery}
            filters={filters}
            formAction={formAction}
            pageSize={pageSize}
            searchLabel={copy.searchLabel}
            textFilters={textFilters}
          />
          <Button asChild data-ds-hit-target variant="ghost">
            <a href={resetUrl}>{copy.clearFilters ?? copy.resetFilters}</a>
          </Button>
        </div>
      ) : null}
      {!isCompact ? (
        <>
          <ActiveFilterChips
            canonicalFilterQuery={canonicalFilterQuery}
            filters={filters}
            formAction={formAction}
            pageSize={pageSize}
            searchLabel={copy.searchLabel}
            textFilters={textFilters}
          />
          <div className="flex flex-wrap items-center gap-3">
            {hasChips ? (
              <Button asChild data-ds-hit-target variant="ghost">
                <a href={resetUrl}>{copy.clearFilters ?? copy.resetFilters}</a>
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
      {interactive ? (
        <noscript>
          <div className="flex flex-wrap gap-3">
            <Button data-ds-hit-target type="submit"><SearchIcon data-icon="inline-start" />{copy.applyFilters}</Button>
            <Button asChild data-ds-hit-target variant="outline">
              <a href={resetUrl}><RotateCcwIcon data-icon="inline-start" />{copy.resetFilters}</a>
            </Button>
          </div>
        </noscript>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button data-ds-hit-target type="submit"><SearchIcon data-icon="inline-start" />{copy.applyFilters}</Button>
          <Button asChild data-ds-hit-target variant="outline">
            <a href={resetUrl}><RotateCcwIcon data-icon="inline-start" />{copy.resetFilters}</a>
          </Button>
        </div>
      )}
    </form>
  );
}

function noop() {
  // Non-interactive opt-out: the debounced search still updates its own
  // controlled value for visual fidelity but never commits a navigation.
}

function StateCard({
  action,
  description,
  state,
  compactToolbar = false,
  title,
}: Readonly<{
  action?: Readonly<{ href: string; label: string }>;
  description: string;
  state: Exclude<DataDirectoryState, "ready" | "loading">;
  compactToolbar?: boolean;
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
    <Empty className={compactToolbar ? "border border-dashed border-border py-8" : undefined} data-directory-state={state}>
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
        <span className="text-sm text-text-2">{copy.loadingDescription}</span>
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
                {actionsLabel ? <TableCell><Skeleton className="h-(--control-row-height) w-24" /></TableCell> : null}
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
              {actionsLabel ? <Skeleton className="h-(--control-row-height) w-24" /> : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Template pagination footer: rows-per-page on the left, previous/next on
// the right, one ruled band. The page-size control lives here but stays
// associated to the toolbar's native GET form through `form=` so the no-JS
// path keeps submitting it.
function DirectoryFooter({
  copy,
  formId,
  idPrefix,
  interactive,
  nextUrl,
  onPageSizeChange,
  pageSize = 25,
  pageSizes = [25, 50, 100],
  previousUrl,
}: Readonly<{
  copy: DataDirectoryCopy;
  formId: string;
  idPrefix: string;
  interactive: boolean;
  nextUrl?: string;
  onPageSizeChange: () => void;
  pageSize?: DirectoryPageSize;
  pageSizes?: readonly DirectoryPageSize[];
  previousUrl?: string;
}>) {
  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
      <Field className="w-auto">
        <FieldLabel htmlFor={`${idPrefix}-page-size`}>{copy.pageSizeLabel}</FieldLabel>
        <NativeSelect
          data-ds-hit-target
          defaultValue={String(pageSize)}
          form={formId}
          id={`${idPrefix}-page-size`}
          name="pageSize"
          onChange={interactive ? onPageSizeChange : undefined}
        >
          {pageSizes.map((size) => (
            <NativeSelectOption key={size} value={String(size)}>{size}</NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {previousUrl || nextUrl ? (
        <Pagination className="justify-start sm:justify-end" label={copy.paginationLabel}>
          <PaginationContent>
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
              <PaginationItem>
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
      ) : null}
    </div>
  );
}

export function DataDirectoryClient(props: DataDirectoryClientProps) {
  const interactive = props.interactive ?? true;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const formId = `${props.idPrefix}-directory-form`;

  const filterNames = useMemo(
    () => [...(props.filters ?? []).map((filter) => filter.name), ...(props.textFilters ?? []).map((filter) => filter.name)],
    [props.filters, props.textFilters],
  );

  const commit = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    const query = buildCommitQuery(form, filterNames);
    const target = query ? `${props.formAction}?${query}` : props.formAction;
    startTransition(() => {
      router.replace(target, { scroll: false });
    });
  }, [filterNames, props.formAction, router]);

  const handleFieldChange = useCallback(
    (event: ChangeEvent<HTMLFormElement>) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.name === "q") return;
      commit();
    },
    [commit],
  );

  const handleRowNavigate = useCallback(
    (href: string) => (event: ReactMouseEvent<HTMLElement>) => {
      if (isInteractiveDescendant(event.target, event.currentTarget)) return;
      router.push(href);
    },
    [router],
  );

  const effectiveState: DataDirectoryState = isPending ? "loading" : props.state;

  const stateAction = effectiveState === "filtered-empty" || effectiveState === "invalid-query"
    ? { href: props.resetUrl, label: props.copy.resetFilters }
    : effectiveState === "error"
      ? { href: props.retryUrl ?? props.resetUrl, label: props.copy.retry }
      : effectiveState === "empty"
        ? props.emptyAction
        : undefined;

  const hasChips = Boolean(props.canonicalFilterQuery && new URLSearchParams(props.canonicalFilterQuery).size > 0);

  return (
    <section aria-busy={effectiveState === "loading" ? true : undefined} className="flex min-w-0 flex-col gap-6" data-data-directory>
      <DirectoryToolbar
        canonicalFilterQuery={props.canonicalFilterQuery}
        compactToolbar={props.compactToolbar}
        copy={props.copy}
        filters={props.filters}
        formAction={props.formAction}
        formId={formId}
        formRef={formRef}
        hasChips={hasChips}
        idPrefix={props.idPrefix}
        interactive={interactive}
        onCommit={commit}
        onFieldChange={handleFieldChange}
        pageSize={props.pageSize}
        resetUrl={props.resetUrl}
        search={props.search}
        textFilters={props.textFilters}
      />
      <Separator />
      {effectiveState === "loading" ? (
        <DirectoryLoading
          actionsLabel={props.actionsLabel}
          caption={props.caption}
          columns={props.columns}
          copy={props.copy}
        />
      ) : null}
      {effectiveState === "empty" ? (
        <StateCard action={stateAction} compactToolbar={Boolean(props.compactToolbar)} description={props.copy.emptyDescription} state="empty" title={props.copy.empty} />
      ) : null}
      {effectiveState === "filtered-empty" ? (
        <StateCard action={stateAction} compactToolbar={Boolean(props.compactToolbar)} description={props.copy.filteredEmptyDescription} state="filtered-empty" title={props.copy.filteredEmpty} />
      ) : null}
      {effectiveState === "invalid-query" ? (
        <StateCard action={stateAction} compactToolbar={Boolean(props.compactToolbar)} description={props.copy.invalidDescription} state="invalid-query" title={props.copy.invalid} />
      ) : null}
      {effectiveState === "error" ? (
        <StateCard action={stateAction} compactToolbar={Boolean(props.compactToolbar)} description={props.copy.errorDescription} state="error" title={props.copy.error} />
      ) : null}
      {effectiveState === "ready" ? (
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
                  <TableRow
                    className={row.href ? "h-13 cursor-pointer" : "h-13"}
                    key={row.key}
                    onClick={row.href ? handleRowNavigate(row.href) : undefined}
                  >
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
              <Card
                className={row.href ? "cursor-pointer" : undefined}
                key={row.key}
                onClick={row.href ? handleRowNavigate(row.href) : undefined}
              >
                <CardContent>
                  <dl className="grid gap-3">
                    {props.columns.map((column, index) => (
                      <div className="grid gap-1 border-b border-border pb-3 last:border-b-0 last:pb-0" key={column.id}>
                        <dt className="text-sm font-medium text-text-2">{column.label}</dt>
                        <dd className={column.numeric ? "m-0 font-mono tabular-nums" : "m-0 break-words"}>{row.cells[index]}</dd>
                      </div>
                    ))}
                  </dl>
                  {row.actions ? <div className="mt-5">{row.actions}</div> : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : null}
      {
        // The footer (page-size select + pagination) stays mounted across a
        // pending commit even though `effectiveState` flips to "loading": it
        // gates on the last committed `props.state` instead, so the select
        // that triggered the transition never unmounts under focus.
        props.state === "ready" ? (
          <DirectoryFooter
            copy={props.copy}
            formId={formId}
            idPrefix={props.idPrefix}
            interactive={interactive}
            nextUrl={props.nextUrl}
            onPageSizeChange={commit}
            pageSize={props.pageSize}
            pageSizes={props.pageSizes}
            previousUrl={props.previousUrl}
          />
        ) : null
      }
    </section>
  );
}
