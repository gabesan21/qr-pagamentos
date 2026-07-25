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

export type LinksSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

export type LinksDirectoryQuery = CanonicalDirectoryRequest;

export function resolveLinksDirectoryQuery(
  input: Readonly<{ searchParams: LinksSearchParams; principal: Principal }>,
  codec: DirectoryCursorCodec = createDirectoryCursorCodec(),
): LinksDirectoryQuery {
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(input.searchParams)) {
    if (value === undefined) continue;
    const values = typeof value === "string" ? [value] : value;
    if (values.length === 0) return { status: "invalid-query" };
    for (const item of values) entries.push([key, item]);
  }
  const serialized = new URLSearchParams(entries).toString();
  return canonicalizeDirectoryRequest({
    requestTarget: serialized ? `${LINKS_DIRECTORY_PATH}?${serialized}` : LINKS_DIRECTORY_PATH,
    path: LINKS_DIRECTORY_PATH,
    definitions: PAYMENT_LINK_V2_DIRECTORY_FILTER_DEFINITIONS,
    directory: LINKS_DIRECTORY_ID,
    scopePurpose: "MERCHANT_OWN",
    principal: input.principal,
    orderId: LINKS_DIRECTORY_ORDER_ID,
    validateTuple: validatePaymentLinkV2DirectoryTuple,
  }, codec);
}
