import "server-only";

import type { Principal } from "@/auth/authorization";
import {
  ADMIN_PAYMENT_LINK_V2_DIRECTORY_FILTERS,
  ADMIN_PAYMENT_LINK_V2_DIRECTORY_ID,
  ADMIN_PAYMENT_LINK_V2_DIRECTORY_ORDER_ID,
  ADMIN_PAYMENT_LINK_V2_DIRECTORY_PAGE_SIZE_POLICY,
  ADMIN_PAYMENT_LINK_V2_DIRECTORY_PATH,
} from "@/auth/payment-link-v2-admin-directory";
import { validatePaymentLinkV2DirectoryTuple } from "@/auth/payment-link-v2-view";
import { canonicalizeDirectoryRequest, type CanonicalDirectoryRequest } from "@/data-directory/server/canonical-request";
import { createDirectoryCursorCodec, type DirectoryCursorCodec } from "@/data-directory/server/cursor";
import { DIRECTORY_INVALID_FILTERS_PARAM } from "@/data-directory/server/notice";

// URL resolution for the administrator global payment-link directory: strict
// canonicalization against the delivered service contract, bound to the
// ADMIN_GLOBAL scope purpose. The reserved invalid-filters pair is stripped
// before canonicalization so a redirect that carries it never loops; no
// other notice keys exist on this read-only surface.
export type AdminPaymentLinksSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

export type AdminPaymentLinksDirectoryQuery = CanonicalDirectoryRequest;

export function resolveAdminPaymentLinksDirectoryQuery(
  input: Readonly<{ searchParams: AdminPaymentLinksSearchParams; principal: Principal }>,
  codec: DirectoryCursorCodec = createDirectoryCursorCodec(),
): AdminPaymentLinksDirectoryQuery {
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(input.searchParams)) {
    if (value === undefined) continue;
    if (key === DIRECTORY_INVALID_FILTERS_PARAM) continue;
    const values = typeof value === "string" ? [value] : value;
    if (values.length === 0) return { status: "invalid-query" };
    for (const item of values) entries.push([key, item]);
  }
  const serialized = new URLSearchParams(entries).toString();
  return canonicalizeDirectoryRequest({
    requestTarget: serialized ? `${ADMIN_PAYMENT_LINK_V2_DIRECTORY_PATH}?${serialized}` : ADMIN_PAYMENT_LINK_V2_DIRECTORY_PATH,
    path: ADMIN_PAYMENT_LINK_V2_DIRECTORY_PATH,
    definitions: ADMIN_PAYMENT_LINK_V2_DIRECTORY_FILTERS,
    directory: ADMIN_PAYMENT_LINK_V2_DIRECTORY_ID,
    scopePurpose: "ADMIN_GLOBAL",
    principal: input.principal,
    orderId: ADMIN_PAYMENT_LINK_V2_DIRECTORY_ORDER_ID,
    validateTuple: validatePaymentLinkV2DirectoryTuple,
    pageSizePolicy: ADMIN_PAYMENT_LINK_V2_DIRECTORY_PAGE_SIZE_POLICY,
  }, codec);
}

type ReadyDirectoryRequest = Extract<CanonicalDirectoryRequest, { status: "ready" }>;

// The full canonical target for the delivered directory service: already
// canonical, so its internal canonicalization resolves ready again.
export function adminPaymentLinksCanonicalTarget(query: ReadyDirectoryRequest): string {
  return query.query.canonicalQuery
    ? `${ADMIN_PAYMENT_LINK_V2_DIRECTORY_PATH}?${query.query.canonicalQuery}`
    : ADMIN_PAYMENT_LINK_V2_DIRECTORY_PATH;
}
