import "server-only";

import { DIRECTORY_INVALID_FILTERS_PARAM } from "@/data-directory/server/notice";
import {
  parseDirectoryQuery,
  type DefaultDirectoryPageSize,
  type DirectoryFilterDefinition,
} from "@/data-directory/server/query-contract";

// Single-page catalog directories reuse the foundation's strict query decoding
// and canonical serialization without its cursor contract: owner catalogs are
// bounded, so no cursor URLs exist and any cursor parameter is invalid here.

export type CatalogSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

export type CatalogDirectoryQuery = Readonly<{
  status: "ready";
  q?: string;
  filters: Readonly<Record<string, string | readonly string[]>>;
  pageSize: DefaultDirectoryPageSize;
  canonicalFilterQuery: string;
  notice?: string;
}> | Readonly<{ status: "redirect"; location: string }> | Readonly<{ status: "invalid-query" }>;

type ResolveInput = Readonly<{
  path: string;
  searchParams: CatalogSearchParams;
  definitions: readonly DirectoryFilterDefinition[];
  noticeKey: string;
  noticeValues: readonly string[];
}>;

function relativeLocation(path: string, query: string) {
  return query ? `${path}?${query}` : path;
}

export function resolveCatalogDirectoryQuery(input: ResolveInput): CatalogDirectoryQuery {
  let notice: string | undefined;
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(input.searchParams)) {
    if (value === undefined) continue;
    // The reserved invalid-filters notice pair is a redirect artifact, not a
    // directory param: dropping it here is what keeps the reset redirect from
    // looping back into another invalid-query resolution.
    if (key === DIRECTORY_INVALID_FILTERS_PARAM) continue;
    if (key === input.noticeKey) {
      if (typeof value !== "string" || !input.noticeValues.includes(value)) return { status: "invalid-query" };
      if (notice !== undefined) return { status: "invalid-query" };
      notice = value;
      continue;
    }
    const values = typeof value === "string" ? [value] : value;
    if (values.length === 0) return { status: "invalid-query" };
    for (const item of values) entries.push([key, item]);
  }

  const serialized = new URLSearchParams(entries).toString();
  const parsed = parseDirectoryQuery(serialized ? `${input.path}?${serialized}` : input.path, input.definitions);
  if (!parsed.ok) return { status: "invalid-query" };
  // A cursor is meaningless without pagination URLs; the single page never
  // issues one, so its presence is always an invalid query.
  if (parsed.value.cursor !== undefined) return { status: "invalid-query" };
  if (serialized !== parsed.value.canonicalQuery) {
    return { status: "redirect", location: relativeLocation(input.path, parsed.value.canonicalQuery) };
  }
  return {
    status: "ready",
    ...(parsed.value.q ? { q: parsed.value.q } : {}),
    filters: parsed.value.filters,
    pageSize: parsed.value.pageSize,
    canonicalFilterQuery: parsed.value.canonicalFilterQuery,
    ...(notice ? { notice } : {}),
  };
}
