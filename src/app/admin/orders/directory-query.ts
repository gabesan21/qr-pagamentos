import "server-only";

import type { Principal } from "@/auth/authorization";
import { canonicalizeDirectoryRequest, type CanonicalDirectoryRequest } from "@/data-directory/server/canonical-request";
import { createDirectoryCursorCodec, type DirectoryCursorCodec, type DirectoryCursorEnvelope } from "@/data-directory/server/cursor";
import { DIRECTORY_INVALID_FILTERS_PARAM } from "@/data-directory/server/notice";
import {
  ADMIN_ORDER_V2_DIRECTORY_FILTERS,
  ADMIN_ORDER_V2_DIRECTORY_ID,
  ADMIN_ORDER_V2_DIRECTORY_ORDER_ID,
  ADMIN_ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY,
  ADMIN_ORDER_V2_DIRECTORY_PATH,
} from "@/orders/order-v2-admin-directory";

// URL resolution for the administrator global order directory: strict
// canonicalization against the delivered service contract, bound to the
// ADMIN_GLOBAL scope purpose. The reserved invalid-filters pair is stripped
// before canonicalization so a redirect that carries it never loops; no
// other notice keys exist on this read-only surface.
export type AdminOrdersSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

export type AdminOrdersDirectoryQuery = CanonicalDirectoryRequest;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The same (created_at epoch ms, id) seek-tuple shape the delivered service
// registers; re-declared here because the service keeps it private.
function isValidSeekTuple(tuple: DirectoryCursorEnvelope["tuple"]) {
  return (
    tuple.length === 2
    && typeof tuple[0] === "number"
    && Number.isSafeInteger(tuple[0])
    && tuple[0] > 0
    && typeof tuple[1] === "string"
    && UUID_PATTERN.test(tuple[1])
  );
}

export function resolveAdminOrdersDirectoryQuery(
  input: Readonly<{ searchParams: AdminOrdersSearchParams; principal: Principal }>,
  codec: DirectoryCursorCodec = createDirectoryCursorCodec(),
): AdminOrdersDirectoryQuery {
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
    requestTarget: serialized ? `${ADMIN_ORDER_V2_DIRECTORY_PATH}?${serialized}` : ADMIN_ORDER_V2_DIRECTORY_PATH,
    path: ADMIN_ORDER_V2_DIRECTORY_PATH,
    definitions: ADMIN_ORDER_V2_DIRECTORY_FILTERS,
    directory: ADMIN_ORDER_V2_DIRECTORY_ID,
    scopePurpose: "ADMIN_GLOBAL",
    principal: input.principal,
    orderId: ADMIN_ORDER_V2_DIRECTORY_ORDER_ID,
    validateTuple: isValidSeekTuple,
    pageSizePolicy: ADMIN_ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY,
  }, codec);
}

type ReadyDirectoryRequest = Extract<CanonicalDirectoryRequest, { status: "ready" }>;

// The full canonical target for the delivered directory service: already
// canonical, so its internal canonicalization resolves ready again.
export function adminOrdersCanonicalTarget(query: ReadyDirectoryRequest): string {
  return query.query.canonicalQuery
    ? `${ADMIN_ORDER_V2_DIRECTORY_PATH}?${query.query.canonicalQuery}`
    : ADMIN_ORDER_V2_DIRECTORY_PATH;
}
