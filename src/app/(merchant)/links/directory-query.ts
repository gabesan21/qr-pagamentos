import "server-only";

import type { Principal } from "@/auth/authorization";
import {
  buildLinksDirectoryFilterDefinitions,
  validatePaymentLinkV2DirectoryTuple,
  validCalendarDayStartUtc,
} from "@/auth/payment-link-v2-view";
import { canonicalizeDirectoryRequest, type CanonicalDirectoryRequest } from "@/data-directory/server/canonical-request";
import { createDirectoryCursorCodec, type DirectoryCursorCodec } from "@/data-directory/server/cursor";
import { DIRECTORY_INVALID_FILTERS_PARAM } from "@/data-directory/server/notice";

// The merchant V2 link directory rides the full foundation contract, cursor
// included: canonical `307` resets, stale-cursor drops, and zero-I/O invalid
// paths all resolve before any adapter read.
export const LINKS_DIRECTORY_ID = "merchant-payment-links-v2";
export const LINKS_DIRECTORY_ORDER_ID = "created-desc";
export const LINKS_DIRECTORY_PATH = "/links";

// The mutation routes land on `/links?payment-links-v2=<outcome>`; the closed
// outcome set is stripped and validated before strict directory
// canonicalization (the catalog `noticeKey` pattern), so a forged or repeated
// value resolves to the zero-I/O invalid-query state and a canonical redirect
// drops the notice.
export const LINKS_NOTICE_KEY = "payment-links-v2";
export const LINKS_NOTICE_VALUES = ["created", "edited", "activated", "deactivated", "failed"] as const;
export type LinksNotice = (typeof LINKS_NOTICE_VALUES)[number];

// The frozen legacy V1 create/revoke redirects land on this same directory
// with their own closed key, resolved and stripped exactly like the V2 key
// so strict canonicalization never sees either as a stray param.
export const LEGACY_LINKS_NOTICE_KEY = "payment-links";
export const LEGACY_LINKS_NOTICE_VALUES = ["created", "revoked", "failed"] as const;
export type LegacyLinksNotice = (typeof LEGACY_LINKS_NOTICE_VALUES)[number];

export type LinksSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

type ReadyDirectoryRequest = Extract<CanonicalDirectoryRequest, { status: "ready" }>;

export type LinksDirectoryQuery =
  | (ReadyDirectoryRequest & Readonly<{ notice?: LinksNotice; legacyNotice?: LegacyLinksNotice }>)
  | Exclude<CanonicalDirectoryRequest, ReadyDirectoryRequest>;

// Shared by the non-directory link pages (`/links/new`, `/links/v2/[id]`, its
// `/edit`) that only need to read the closed V2 notice off their own query
// string, with none of the directory canonicalization above.
export function parseLinksNotice(value: string | readonly string[] | undefined): LinksNotice | undefined {
  return typeof value === "string" && (LINKS_NOTICE_VALUES as readonly string[]).includes(value)
    ? (value as LinksNotice)
    : undefined;
}

function firstValue(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}

export function resolveLinksDirectoryQuery(
  input: Readonly<{ searchParams: LinksSearchParams; principal: Principal; ownerPairIds?: readonly string[] }>,
  codec: DirectoryCursorCodec = createDirectoryCursorCodec(),
): LinksDirectoryQuery {
  let notice: LinksNotice | undefined;
  let legacyNotice: LegacyLinksNotice | undefined;
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(input.searchParams)) {
    if (value === undefined) continue;
    // The reserved invalid-filters notice pair is a redirect artifact, not a
    // directory param: dropping it here is what keeps the reset redirect from
    // looping back into another invalid-query resolution.
    if (key === DIRECTORY_INVALID_FILTERS_PARAM) continue;
    if (key === LINKS_NOTICE_KEY) {
      if (typeof value !== "string" || notice !== undefined) return { status: "invalid-query" };
      if (!(LINKS_NOTICE_VALUES as readonly string[]).includes(value)) return { status: "invalid-query" };
      notice = value as LinksNotice;
      continue;
    }
    if (key === LEGACY_LINKS_NOTICE_KEY) {
      if (typeof value !== "string" || legacyNotice !== undefined) return { status: "invalid-query" };
      if (!(LEGACY_LINKS_NOTICE_VALUES as readonly string[]).includes(value)) return { status: "invalid-query" };
      legacyNotice = value as LegacyLinksNotice;
      continue;
    }
    const values = typeof value === "string" ? [value] : value;
    if (values.length === 0) return { status: "invalid-query" };
    for (const item of values) entries.push([key, item]);
  }
  const serialized = new URLSearchParams(entries).toString();
  const resolved = canonicalizeDirectoryRequest({
    requestTarget: serialized ? `${LINKS_DIRECTORY_PATH}?${serialized}` : LINKS_DIRECTORY_PATH,
    path: LINKS_DIRECTORY_PATH,
    definitions: buildLinksDirectoryFilterDefinitions(input.ownerPairIds),
    directory: LINKS_DIRECTORY_ID,
    scopePurpose: "MERCHANT_OWN",
    principal: input.principal,
    orderId: LINKS_DIRECTORY_ORDER_ID,
    validateTuple: validatePaymentLinkV2DirectoryTuple,
  }, codec);
  if (resolved.status !== "ready") return resolved;
  // Ungrammatical or nonexistent calendar days are the zero-I/O invalid
  // outcome, exactly like the administrator directory's own `from`/`to`.
  const from = firstValue(resolved.query.filters.from);
  const to = firstValue(resolved.query.filters.to);
  if (from !== undefined && validCalendarDayStartUtc(from) === null) return { status: "invalid-query" };
  if (to !== undefined && validCalendarDayStartUtc(to) === null) return { status: "invalid-query" };
  return { ...resolved, ...(notice !== undefined ? { notice } : {}), ...(legacyNotice !== undefined ? { legacyNotice } : {}) };
}
