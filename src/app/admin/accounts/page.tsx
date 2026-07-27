import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminAccountsSurface } from "@/app/admin/admin-surface";
import {
  ADMIN_USER_DIRECTORY_PAGE_SIZE_POLICY,
  ADMIN_USER_DIRECTORY_PATH,
  queryAdminUserDirectory,
  type AdminUserDirectoryResult,
  type AdminUserSummary,
} from "@/auth/admin-user-directory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataDirectory, type DataDirectoryColumn, type DataDirectoryState } from "@/data-directory/ui/data-directory";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

import { requireAdminShellContext } from "../shell-context";
import { adminAccountsDirectoryCopy } from "./directory-copy";
import {
  adminAccountsCanonicalTarget,
  resolveAdminAccountsDirectoryQuery,
  type AdminAccountsSearchParams,
} from "./directory-query";
import { formatAccountInstant } from "./instant";

type Dictionary = ReturnType<typeof getDictionary>;

function firstValue(value: string | readonly string[] | undefined) {
  return typeof value === "string" ? value : value?.[0];
}

function pageUrl(query: Readonly<{ canonicalFilterQuery: string; pageSize: number }>, cursor: string | undefined) {
  const parameters = [
    query.canonicalFilterQuery,
    query.pageSize === ADMIN_USER_DIRECTORY_PAGE_SIZE_POLICY.defaultSize ? "" : `pageSize=${query.pageSize}`,
    cursor ? `cursor=${cursor}` : "",
  ].filter((entry) => entry !== "").join("&");
  return parameters ? `${ADMIN_USER_DIRECTORY_PATH}?${parameters}` : ADMIN_USER_DIRECTORY_PATH;
}

function storeStateLabel(dictionary: Dictionary, storeState: AdminUserSummary["storeState"]) {
  return storeState === "active"
    ? dictionary.adminUsersDirectoryStoreActive
    : storeState === "configured"
      ? dictionary.adminUsersDirectoryStoreConfigured
      : dictionary.adminUsersDirectoryStoreNone;
}

// The username cell carries the administrator-only deletion fact as a
// localized non-color badge; a deleted row keeps its place and renders no
// actions (every mutation on a deleted target already shares the opaque
// not-found outcome server-side).
function UsernameCell({ dictionary, row }: Readonly<{ dictionary: Dictionary; row: AdminUserSummary }>) {
  return (
    <>
      {row.username}
      {row.deletedAt !== null ? <> <Badge variant="outline">{dictionary.adminUsersDirectoryStateDeleted}</Badge></> : null}
    </>
  );
}

function StateBadge({ dictionary, row }: Readonly<{ dictionary: Dictionary; row: AdminUserSummary }>) {
  if (row.state === "deleted") return <Badge variant="outline">{dictionary.adminUsersDirectoryStateDeleted}</Badge>;
  if (row.state === "disabled") return <Badge variant="destructive">{dictionary.adminDisabled}</Badge>;
  return <Badge variant="secondary">{dictionary.adminActive}</Badge>;
}

// Row actions: edit navigates to the read-only detail (10.3.3's editor
// contract) and delete posts the delivered byte-frozen soft-delete route;
// final-active-administrator protection stays server-side only.
function RowActions({ dictionary, row }: Readonly<{ dictionary: Dictionary; row: AdminUserSummary }>) {
  if (row.state === "deleted") return null;
  return (
    <>
      <Button asChild data-ds-hit-target variant="outline">
        <Link href={`/admin/accounts/${row.id}`}>{dictionary.adminUsersDirectoryEdit}</Link>
      </Button>
      {" "}
      <form action={`/admin/users/${row.id}/delete`} method="post">
        <Button data-ds-hit-target type="submit" variant="destructive">{dictionary.adminUsersDirectoryDelete}</Button>
      </form>
    </>
  );
}

function AdminUserDirectory({
  dictionary,
  locale,
  page,
  query,
  serviceInvalid = false,
}: Readonly<{
  dictionary: Dictionary;
  locale: SupportedLocale;
  page: Extract<AdminUserDirectoryResult, { status: "ready" }> | null;
  query: Extract<ReturnType<typeof resolveAdminAccountsDirectoryQuery>, { status: "ready" | "invalid-query" }>;
  serviceInvalid?: boolean;
}>) {
  const copy = adminAccountsDirectoryCopy(dictionary);
  const columns: readonly DataDirectoryColumn<AdminUserSummary>[] = [
    { id: "username", label: dictionary.adminUsersDirectoryColumnUsername, value: (row) => <UsernameCell dictionary={dictionary} row={row} /> },
    { id: "email", label: dictionary.adminUsersDirectoryColumnEmail, value: (row) => row.email ?? dictionary.adminNotProvided },
    { id: "role", label: dictionary.adminUsersDirectoryColumnRole, value: (row) => <Badge variant="outline">{row.role === "ADMIN" ? dictionary.adminAdministrator : dictionary.adminUser}</Badge> },
    { id: "state", label: dictionary.adminUsersDirectoryColumnState, value: (row) => <StateBadge dictionary={dictionary} row={row} /> },
    { id: "store", label: dictionary.adminUsersDirectoryColumnStore, value: (row) => storeStateLabel(dictionary, row.storeState) },
    { id: "created", label: dictionary.adminUsersDirectoryColumnCreated, numeric: true, value: (row) => formatAccountInstant(row.createdAt, locale) },
    { id: "lastActivity", label: dictionary.adminUsersDirectoryColumnLastActivity, numeric: true, value: (row) => row.lastActivityAt ? formatAccountInstant(row.lastActivityAt, locale) : dictionary.adminUsersDirectoryLastActivityNever },
  ];

  if (query.status === "invalid-query" || serviceInvalid) {
    return (
      <DataDirectory
        caption={dictionary.adminUsersDirectoryHeading}
        columns={columns}
        copy={copy}
        formAction={ADMIN_USER_DIRECTORY_PATH}
        idPrefix="admin-users"
        resetUrl={ADMIN_USER_DIRECTORY_PATH}
        rowKey={(row) => row.id}
        rows={[]}
        state="invalid-query"
      />
    );
  }

  const rows = page?.rows ?? [];
  const filtering = Boolean(query.query.q) || Object.keys(query.query.filters).length > 0 || query.cursor !== undefined;
  const state: DataDirectoryState = page === null
    ? "error"
    : rows.length === 0
      ? filtering ? "filtered-empty" : "empty"
      : "ready";

  return (
    <DataDirectory
      actionsLabel={dictionary.adminUsersDirectoryColumnActions}
      caption={dictionary.adminUsersDirectoryHeading}
      columns={columns}
      copy={copy}
      filters={[
        {
          name: "role",
          label: dictionary.adminUsersDirectoryFilterRole,
          allLabel: dictionary.adminUsersDirectoryFilterAllRoles,
          ...(firstValue(query.query.filters.role) ? { selected: firstValue(query.query.filters.role) } : {}),
          options: [
            { value: "USER", label: dictionary.adminUser },
            { value: "ADMIN", label: dictionary.adminAdministrator },
          ],
        },
        {
          name: "state",
          label: dictionary.adminUsersDirectoryFilterState,
          allLabel: dictionary.adminUsersDirectoryFilterAllStates,
          ...(firstValue(query.query.filters.state) ? { selected: firstValue(query.query.filters.state) } : {}),
          options: [
            { value: "ACTIVE", label: dictionary.adminActive },
            { value: "DISABLED", label: dictionary.adminDisabled },
            { value: "DELETED", label: dictionary.adminUsersDirectoryStateDeleted },
          ],
        },
      ]}
      formAction={ADMIN_USER_DIRECTORY_PATH}
      getRowActions={(row) => <RowActions dictionary={dictionary} row={row} />}
      idPrefix="admin-users"
      {...(page?.nextCursor ? { nextUrl: pageUrl(query.query, page.nextCursor) } : {})}
      pageSize={query.query.pageSize}
      pageSizes={ADMIN_USER_DIRECTORY_PAGE_SIZE_POLICY.sizes}
      {...(page?.previousCursor ? { previousUrl: pageUrl(query.query, page.previousCursor) } : {})}
      resetUrl={ADMIN_USER_DIRECTORY_PATH}
      retryUrl={ADMIN_USER_DIRECTORY_PATH}
      rowKey={(row) => row.id}
      rows={rows}
      {...(query.query.q ? { search: query.query.q } : {})}
      state={state}
      textFilters={[
        {
          name: "from",
          label: dictionary.adminUsersDirectoryFilterFrom,
          calendarDay: true,
          ...(firstValue(query.query.filters.from) ? { selected: firstValue(query.query.filters.from) } : {}),
        },
        {
          name: "to",
          label: dictionary.adminUsersDirectoryFilterTo,
          calendarDay: true,
          ...(firstValue(query.query.filters.to) ? { selected: firstValue(query.query.filters.to) } : {}),
        },
      ]}
    />
  );
}

export default async function AdminAccountsPage({
  searchParams = Promise.resolve({}),
}: Readonly<{
  searchParams?: Promise<AdminAccountsSearchParams>;
}> = {}) {
  const { dictionary, locale, principal } = await requireAdminShellContext();
  const query = resolveAdminAccountsDirectoryQuery({ searchParams: await searchParams, principal });
  if (query.status === "redirect") redirect(query.location);

  let page: Extract<AdminUserDirectoryResult, { status: "ready" }> | null = null;
  // The delivered service rejects ungrammatical calendar days after
  // canonicalization; that is the same zero-I/O invalid-query state.
  let serviceInvalid = false;
  let serviceRedirect: string | null = null;
  if (query.status === "ready") {
    try {
      const result = await queryAdminUserDirectory(adminAccountsCanonicalTarget(query));
      if (result.status === "ready") page = result;
      else if (result.status === "invalid-query") serviceInvalid = true;
      else serviceRedirect = result.location;
    } catch {
      page = null;
    }
  }
  if (serviceRedirect !== null) redirect(serviceRedirect);

  const notice = query.status === "ready" && query.notice
    ? {
        tone: query.notice.tone,
        text: query.notice.value === "created"
          ? dictionary.adminCreated
          : query.notice.value === "changed"
            ? dictionary.adminChanged
            : query.notice.value === "create-failed"
              ? dictionary.adminCreateFailed
              : dictionary.adminChangeFailed,
      }
    : null;

  return (
    <AdminAccountsSurface dictionary={dictionary} notice={notice}>
      <AdminUserDirectory dictionary={dictionary} locale={locale} page={page} query={query} serviceInvalid={serviceInvalid} />
    </AdminAccountsSurface>
  );
}
