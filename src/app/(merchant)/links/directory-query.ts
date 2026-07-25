import "server-only";

import type { Principal } from "@/auth/authorization";
import {
  PAYMENT_LINK_V2_DIRECTORY_FILTER_DEFINITIONS,
  validatePaymentLinkV2DirectoryTuple,
} from "@/auth/payment-link-v2-view";
import { canonicalizeDirectoryRequest, type CanonicalDirectoryRequest } from "@/data-directory/server/canonical-request";
import { createDirectoryCursorCodec, type DirectoryCursorCodec } from "@/data-directory/server/cursor";

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

export type LinksSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

type ReadyDirectoryRequest = Extract<CanonicalDirectoryRequest, { status: "ready" }>;

export type LinksDirectoryQuery =
  | (ReadyDirectoryRequest & Readonly<{ notice?: LinksNotice }>)
  | Exclude<CanonicalDirectoryRequest, ReadyDirectoryRequest>;

export function resolveLinksDirectoryQuery(
  input: Readonly<{ searchParams: LinksSearchParams; principal: Principal }>,
  codec: DirectoryCursorCodec = createDirectoryCursorCodec(),
): LinksDirectoryQuery {
  let notice: LinksNotice | undefined;
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(input.searchParams)) {
    if (value === undefined) continue;
    if (key === LINKS_NOTICE_KEY) {
      if (typeof value !== "string" || notice !== undefined) return { status: "invalid-query" };
      if (!(LINKS_NOTICE_VALUES as readonly string[]).includes(value)) return { status: "invalid-query" };
      notice = value as LinksNotice;
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
    definitions: PAYMENT_LINK_V2_DIRECTORY_FILTER_DEFINITIONS,
    directory: LINKS_DIRECTORY_ID,
    scopePurpose: "MERCHANT_OWN",
    principal: input.principal,
    orderId: LINKS_DIRECTORY_ORDER_ID,
    validateTuple: validatePaymentLinkV2DirectoryTuple,
  }, codec);
  if (resolved.status === "ready" && notice !== undefined) return { ...resolved, notice };
  return resolved;
}
