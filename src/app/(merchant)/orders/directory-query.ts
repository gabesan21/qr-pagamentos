import "server-only";

import type { Principal } from "@/auth/authorization";
import { canonicalizeDirectoryRequest, type CanonicalDirectoryRequest } from "@/data-directory/server/canonical-request";
import { createDirectoryCursorCodec, type DirectoryCursorCodec, type DirectoryCursorEnvelope } from "@/data-directory/server/cursor";
import {
  ORDER_V2_DIRECTORY_FILTERS,
  ORDER_V2_DIRECTORY_ID,
  ORDER_V2_DIRECTORY_ORDER_ID,
  ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY,
  ORDER_V2_DIRECTORY_PATH,
} from "@/orders/order-v2-directory";

// The engagement mutation routes land on `/orders?orders-v2=<outcome>`; the
// closed outcome set is stripped and validated before strict directory
// canonicalization (the catalog/links `noticeKey` pattern), so a forged or
// repeated value resolves to the zero-I/O invalid-query state and a canonical
// redirect drops the notice.
export const ORDERS_NOTICE_KEY = "orders-v2";
export const ORDERS_NOTICE_VALUES = ["commented", "comment-edited", "outcome-set", "failed"] as const;
export type OrdersNotice = (typeof ORDERS_NOTICE_VALUES)[number];

export type OrdersSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

type ReadyDirectoryRequest = Extract<CanonicalDirectoryRequest, { status: "ready" }>;

export type OrdersDirectoryQuery =
  | (ReadyDirectoryRequest & Readonly<{ notice?: OrdersNotice }>)
  | Exclude<CanonicalDirectoryRequest, ReadyDirectoryRequest>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The same (created_at epoch ms, id) seek-tuple shape the delivered directory
// service registers; re-declared here because the service keeps it private.
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

export function resolveOrdersDirectoryQuery(
  input: Readonly<{ searchParams: OrdersSearchParams; principal: Principal }>,
  codec: DirectoryCursorCodec = createDirectoryCursorCodec(),
): OrdersDirectoryQuery {
  let notice: OrdersNotice | undefined;
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(input.searchParams)) {
    if (value === undefined) continue;
    if (key === ORDERS_NOTICE_KEY) {
      if (typeof value !== "string" || notice !== undefined) return { status: "invalid-query" };
      if (!(ORDERS_NOTICE_VALUES as readonly string[]).includes(value)) return { status: "invalid-query" };
      notice = value as OrdersNotice;
      continue;
    }
    const values = typeof value === "string" ? [value] : value;
    if (values.length === 0) return { status: "invalid-query" };
    for (const item of values) entries.push([key, item]);
  }
  const serialized = new URLSearchParams(entries).toString();
  const resolved = canonicalizeDirectoryRequest({
    requestTarget: serialized ? `${ORDER_V2_DIRECTORY_PATH}?${serialized}` : ORDER_V2_DIRECTORY_PATH,
    path: ORDER_V2_DIRECTORY_PATH,
    definitions: ORDER_V2_DIRECTORY_FILTERS,
    directory: ORDER_V2_DIRECTORY_ID,
    scopePurpose: "MERCHANT_OWN",
    principal: input.principal,
    orderId: ORDER_V2_DIRECTORY_ORDER_ID,
    validateTuple: isValidSeekTuple,
    pageSizePolicy: ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY,
  }, codec);
  if (resolved.status === "ready" && notice !== undefined) return { ...resolved, notice };
  return resolved;
}

// The full canonical target for the delivered directory service: already
// canonical, so its internal canonicalization resolves ready again.
export function ordersCanonicalTarget(query: ReadyDirectoryRequest): string {
  return query.query.canonicalQuery
    ? `${ORDER_V2_DIRECTORY_PATH}?${query.query.canonicalQuery}`
    : ORDER_V2_DIRECTORY_PATH;
}
