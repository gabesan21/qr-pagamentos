import "server-only";

import { TextDecoder } from "node:util";

export const DIRECTORY_PAGE_SIZES = [10, 20, 25, 50, 100] as const;
export const DEFAULT_DIRECTORY_PAGE_SIZE = 25;
export const MAX_RAW_QUERY_BYTES = 2048;
export const MAX_QUERY_ENTRIES = 32;
export const MAX_REGISTERED_FILTERS = 8;

export type DirectoryPageSize = (typeof DIRECTORY_PAGE_SIZES)[number];

// Each directory registers its own closed page-size subset and default; the
// foundation-wide set above stays the superset every registration draws from.
export type DirectoryPageSizePolicy = Readonly<{
  sizes: readonly DirectoryPageSize[];
  defaultSize: DirectoryPageSize;
}>;

export const DEFAULT_DIRECTORY_PAGE_SIZE_POLICY = {
  sizes: [25, 50, 100],
  defaultSize: DEFAULT_DIRECTORY_PAGE_SIZE,
} as const satisfies DirectoryPageSizePolicy;

// Size union of the default registration; consumers that never register their
// own policy keep this narrow type instead of the foundation-wide superset.
export type DefaultDirectoryPageSize = (typeof DEFAULT_DIRECTORY_PAGE_SIZE_POLICY)["sizes"][number];

export type DirectoryFilterDefinition =
  | Readonly<{ name: string; kind: "text" }>
  | Readonly<{ name: string; kind: "enum"; values: readonly string[] }>;

export type ParsedDirectoryQuery<Size extends DirectoryPageSize = DirectoryPageSize> = Readonly<{
  q?: string;
  filters: Readonly<Record<string, string | readonly string[]>>;
  pageSize: Size;
  cursor?: string;
  canonicalQuery: string;
  canonicalFilterQuery: string;
}>;

export type DirectoryQueryResult<Size extends DirectoryPageSize = DirectoryPageSize> =
  | Readonly<{ ok: true; value: ParsedDirectoryQuery<Size> }>
  | Readonly<{ ok: false }>;

const fatalUtf8 = new TextDecoder("utf-8", { fatal: true });
const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/u;
const filterName = /^[a-z][a-z0-9-]{0,31}$/;
const enumValue = /^[A-Za-z0-9_-]{1,64}$/;

function rawQueryFromTarget(requestTarget: string): string {
  const question = requestTarget.indexOf("?");
  if (question < 0) return "";
  const fragment = requestTarget.indexOf("#", question + 1);
  return requestTarget.slice(question + 1, fragment < 0 ? undefined : fragment);
}

function decodeFormComponent(raw: string): string | null {
  if (/%(?![0-9a-fA-F]{2})/u.test(raw)) return null;
  const bytes: number[] = [];
  for (let index = 0; index < raw.length;) {
    const character = raw[index];
    if (character === "%") {
      bytes.push(Number.parseInt(raw.slice(index + 1, index + 3), 16));
      index += 3;
    } else if (character === "+") {
      bytes.push(0x20);
      index += 1;
    } else {
      const codePoint = raw.codePointAt(index);
      if (codePoint === undefined || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return null;
      const scalar = String.fromCodePoint(codePoint);
      const encoded = Buffer.from(scalar, "utf8");
      bytes.push(...encoded);
      index += scalar.length;
    }
  }
  try {
    return fatalUtf8.decode(Uint8Array.from(bytes));
  } catch {
    return null;
  }
}

function decodeEntries(rawQuery: string): Array<readonly [string, string]> | null {
  if (rawQuery === "") return [];
  const chunks = rawQuery.split("&");
  if (chunks.length > MAX_QUERY_ENTRIES) return null;
  const entries: Array<readonly [string, string]> = [];
  for (const chunk of chunks) {
    const equals = chunk.indexOf("=");
    const rawKey = equals < 0 ? chunk : chunk.slice(0, equals);
    const rawValue = equals < 0 ? "" : chunk.slice(equals + 1);
    const key = decodeFormComponent(rawKey);
    const value = decodeFormComponent(rawValue);
    if (key === null || value === null) return null;
    entries.push([key, value]);
  }
  return entries;
}

function normalizedText(value: string): string | null {
  const normalized = value.trim();
  if (
    controlCharacters.test(value)
    ||
    normalized.length === 0
    || Array.from(normalized).length > 100
  ) return null;
  return normalized;
}

function validDefinitions(
  definitions: readonly DirectoryFilterDefinition[],
): definitions is readonly DirectoryFilterDefinition[] {
  if (definitions.length > MAX_REGISTERED_FILTERS) return false;
  const names = new Set<string>();
  for (const definition of definitions) {
    if (!filterName.test(definition.name) || names.has(definition.name)) return false;
    names.add(definition.name);
    if (
      definition.kind === "enum"
      && (
        definition.values.length === 0
        || definition.values.length > 64
        || new Set(definition.values).size !== definition.values.length
        || definition.values.some((value) => !enumValue.test(value))
      )
    ) return false;
  }
  return true;
}

function valuesByKey(entries: readonly (readonly [string, string])[]) {
  const values = new Map<string, string[]>();
  for (const [key, value] of entries) {
    const current = values.get(key) ?? [];
    current.push(value);
    values.set(key, current);
  }
  return values;
}

function single(values: Map<string, string[]>, key: string): string | null | undefined {
  const matches = values.get(key);
  if (!matches) return undefined;
  return matches.length === 1 ? matches[0] : null;
}

function validPageSizePolicy(
  policy: DirectoryPageSizePolicy,
): policy is DirectoryPageSizePolicy {
  return (
    policy.sizes.length > 0
    && new Set(policy.sizes).size === policy.sizes.length
    && policy.sizes.every((size) => DIRECTORY_PAGE_SIZES.includes(size))
    && policy.sizes.includes(policy.defaultSize)
  );
}

export function parseDirectoryQuery<const Policy extends DirectoryPageSizePolicy = typeof DEFAULT_DIRECTORY_PAGE_SIZE_POLICY>(
  requestTarget: string,
  definitions: readonly DirectoryFilterDefinition[],
  pageSizePolicy?: Policy,
): DirectoryQueryResult<Policy["sizes"][number]> {
  const policy: DirectoryPageSizePolicy = pageSizePolicy ?? DEFAULT_DIRECTORY_PAGE_SIZE_POLICY;
  if (!validDefinitions(definitions) || !validPageSizePolicy(policy)) return { ok: false };
  const rawQuery = rawQueryFromTarget(requestTarget);
  if (!isRawDirectoryQueryWithinLimit(rawQuery)) return { ok: false };
  const entries = decodeEntries(rawQuery);
  if (!entries) return { ok: false };

  const allowed = new Set(["q", "pageSize", "cursor", ...definitions.map(({ name }) => `filter.${name}`)]);
  if (entries.some(([key]) => !allowed.has(key))) return { ok: false };
  const values = valuesByKey(entries);

  const rawSearch = single(values, "q");
  const rawSize = single(values, "pageSize");
  const rawCursor = single(values, "cursor");
  if (rawSearch === null || rawSize === null || rawCursor === null) return { ok: false };
  const q = rawSearch === undefined || rawSearch === "" ? undefined : normalizedText(rawSearch);
  if (rawSearch !== undefined && rawSearch !== "" && q === null) return { ok: false };

  const pageSize = rawSize === undefined || rawSize === ""
    ? policy.defaultSize
    : Number(rawSize);
  if (!policy.sizes.includes(pageSize as DirectoryPageSize)) return { ok: false };
  const cursor = rawCursor === undefined || rawCursor === "" ? undefined : rawCursor;

  const filters: Record<string, string | readonly string[]> = {};
  for (const definition of definitions) {
    const matches = values.get(`filter.${definition.name}`) ?? [];
    if (definition.kind === "text") {
      if (matches.length > 1) return { ok: false };
      if (matches.length === 1 && matches[0].trim() !== "") {
        const normalized = normalizedText(matches[0]);
        if (!normalized) return { ok: false };
        filters[definition.name] = normalized;
      }
      continue;
    }
    if (matches.length > 5 || matches.some((value) => !definition.values.includes(value))) {
      return { ok: false };
    }
    const normalized = [...new Set(matches)].sort();
    if (normalized.length > 0) filters[definition.name] = normalized;
  }

  const filterParams = new URLSearchParams();
  if (q) filterParams.append("q", q);
  for (const definition of definitions) {
    const value = filters[definition.name];
    if (typeof value === "string") filterParams.append(`filter.${definition.name}`, value);
    if (Array.isArray(value)) {
      for (const item of value) filterParams.append(`filter.${definition.name}`, item);
    }
  }
  const canonicalFilterQuery = filterParams.toString();
  const canonical = new URLSearchParams(filterParams);
  if (pageSize !== policy.defaultSize) canonical.append("pageSize", String(pageSize));
  if (cursor) canonical.append("cursor", cursor);

  return {
    ok: true,
    value: {
      ...(q ? { q } : {}),
      filters,
      pageSize: pageSize as Policy["sizes"][number],
      ...(cursor ? { cursor } : {}),
      canonicalQuery: canonical.toString(),
      canonicalFilterQuery,
    },
  };
}

export function getRawDirectoryQuery(requestTarget: string) {
  return rawQueryFromTarget(requestTarget);
}

export function isRawDirectoryQueryWithinLimit(rawQuery: string) {
  return Buffer.byteLength(rawQuery, "utf8") <= MAX_RAW_QUERY_BYTES;
}
