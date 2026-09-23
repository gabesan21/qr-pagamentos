import "server-only";

import type { Principal } from "@/auth/authorization";
import {
  ADMIN_USER_DIRECTORY_FILTERS,
  ADMIN_USER_DIRECTORY_ID,
  ADMIN_USER_DIRECTORY_ORDER_ID,
  ADMIN_USER_DIRECTORY_PAGE_SIZE_POLICY,
  ADMIN_USER_DIRECTORY_PATH,
} from "@/auth/admin-user-directory";
import { canonicalizeDirectoryRequest, type CanonicalDirectoryRequest } from "@/data-directory/server/canonical-request";
import { createDirectoryCursorCodec, type DirectoryCursorCodec, type DirectoryCursorEnvelope } from "@/data-directory/server/cursor";
import { DIRECTORY_INVALID_FILTERS_PARAM } from "@/data-directory/server/notice";

// URL resolution for the administrator user directory: the delivered notice
// keys are stripped and validated against their closed sets before strict
// canonicalization (the merchant orders `noticeKey` pattern), so a forged or
// repeated value resolves to the zero-I/O invalid-query state and a canonical
// redirect drops the notice. The reserved invalid-filters pair is stripped
// the same way, unconditionally, so a redirect that carries it never loops.
export const ADMIN_ACCOUNTS_NOTICE_SUCCESS_VALUES = ["created", "changed"] as const;
export const ADMIN_ACCOUNTS_NOTICE_ERROR_VALUES = ["create-failed", "change-failed"] as const;
export type AdminAccountsNotice =
  | Readonly<{ tone: "success"; value: (typeof ADMIN_ACCOUNTS_NOTICE_SUCCESS_VALUES)[number] }>
  | Readonly<{ tone: "error"; value: (typeof ADMIN_ACCOUNTS_NOTICE_ERROR_VALUES)[number] }>;

export type AdminAccountsSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

type ReadyDirectoryRequest = Extract<CanonicalDirectoryRequest, { status: "ready" }>;

export type AdminAccountsDirectoryQuery =
  | (ReadyDirectoryRequest & Readonly<{ notice?: AdminAccountsNotice }>)
  | Exclude<CanonicalDirectoryRequest, ReadyDirectoryRequest>;

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

export function resolveAdminAccountsDirectoryQuery(
  input: Readonly<{ searchParams: AdminAccountsSearchParams; principal: Principal }>,
  codec: DirectoryCursorCodec = createDirectoryCursorCodec(),
): AdminAccountsDirectoryQuery {
  let notice: AdminAccountsNotice | undefined;
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(input.searchParams)) {
    if (value === undefined) continue;
    if (key === DIRECTORY_INVALID_FILTERS_PARAM) continue;
    if (key === "success" || key === "error") {
      if (typeof value !== "string" || notice !== undefined) return { status: "invalid-query" };
      if (key === "success" && (ADMIN_ACCOUNTS_NOTICE_SUCCESS_VALUES as readonly string[]).includes(value)) {
        notice = { tone: "success", value: value as (typeof ADMIN_ACCOUNTS_NOTICE_SUCCESS_VALUES)[number] };
        continue;
      }
      if (key === "error" && (ADMIN_ACCOUNTS_NOTICE_ERROR_VALUES as readonly string[]).includes(value)) {
        notice = { tone: "error", value: value as (typeof ADMIN_ACCOUNTS_NOTICE_ERROR_VALUES)[number] };
        continue;
      }
      return { status: "invalid-query" };
    }
    const values = typeof value === "string" ? [value] : value;
    if (values.length === 0) return { status: "invalid-query" };
    for (const item of values) entries.push([key, item]);
  }
  const serialized = new URLSearchParams(entries).toString();
  const resolved = canonicalizeDirectoryRequest({
    requestTarget: serialized ? `${ADMIN_USER_DIRECTORY_PATH}?${serialized}` : ADMIN_USER_DIRECTORY_PATH,
    path: ADMIN_USER_DIRECTORY_PATH,
    definitions: ADMIN_USER_DIRECTORY_FILTERS,
    directory: ADMIN_USER_DIRECTORY_ID,
    scopePurpose: "ADMIN_GLOBAL",
    principal: input.principal,
    orderId: ADMIN_USER_DIRECTORY_ORDER_ID,
    validateTuple: isValidSeekTuple,
    pageSizePolicy: ADMIN_USER_DIRECTORY_PAGE_SIZE_POLICY,
  }, codec);
  if (resolved.status === "ready" && notice !== undefined) return { ...resolved, notice };
  return resolved;
}

// The full canonical target for the delivered directory service: already
// canonical, so its internal canonicalization resolves ready again.
export function adminAccountsCanonicalTarget(query: ReadyDirectoryRequest): string {
  return query.query.canonicalQuery
    ? `${ADMIN_USER_DIRECTORY_PATH}?${query.query.canonicalQuery}`
    : ADMIN_USER_DIRECTORY_PATH;
}
