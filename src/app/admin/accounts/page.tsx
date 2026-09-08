import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminAccountsSurface } from "@/app/admin/admin-surface";
import { dataDirectoryCopy, DirectoryInvalidFiltersNotice } from "@/app/directory-support";
import {
  ADMIN_USER_DIRECTORY_PAGE_SIZE_POLICY,
  ADMIN_USER_DIRECTORY_PATH,
  queryAdminUserDirectory,
  type AdminUserDirectoryResult,
  type AdminUserSummary,
} from "@/auth/admin-user-directory";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { directoryInvalidFiltersLocation } from "@/data-directory/server/notice";
import { DataDirectory, type DataDirectoryColumn, type DataDirectoryState } from "@/data-directory/ui/data-directory";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

import { requireAdminShellContext } from "../shell-context";
import { DestructiveActionForm } from "./destructive-confirm";
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

function roleTone(role: AdminUserSummary["role"]): "info" | "neutral" {
  return role === "ADMIN" ? "info" : "neutral";
}

function stateTone(state: AdminUserSummary["state"]): "success" | "warning" | "danger" {
  return state === "active" ? "success" : state === "disabled" ? "warning" : "danger";
}

function accountStateLabel(dictionary: Dictionary, state: AdminUserSummary["state"]) {
  return state === "deleted"
    ? dictionary.adminUsersDirectoryStateDeleted
    : state === "disabled"
      ? dictionary.adminDisabled
      : dictionary.adminActive;
}

// The username cell carries the administrator-only deletion fact as a
// localized non-color badge; a deleted row keeps its place and renders no
// actions (every mutation on a deleted target already shares the opaque
// not-found outcome server-side).
function UsernameCell({ dictionary, row }: Readonly<{ dictionary: Dictionary; row: AdminUserSummary }>) {
  return (
    <span className="flex items-center gap-2">
      <span className={row.deletedAt !== null ? "font-mono line-through" : "font-mono"}>{row.username}</span>
      {row.deletedAt !== null ? (
        <StatusBadge label={dictionary.adminUsersDirectoryStateDeleted} tone="neutral" />
      ) : null}
    </span>
  );
}

function RoleBadge({ dictionary, row }: Readonly<{ dictionary: Dictionary; row: AdminUserSummary }>) {
  return (
    <StatusBadge
      label={row.role === "ADMIN" ? dictionary.adminAdministrator : dictionary.adminUser}
      tone={roleTone(row.role)}
    />
  );
}

function StateBadge({ dictionary, row }: Readonly<{ dictionary: Dictionary; row: AdminUserSummary }>) {
  return (
    <StatusBadge
      label={accountStateLabel(dictionary, row.state)}
      tone={stateTone(row.state)}
    />
  );
}

function StoreBadge({ dictionary, row }: Readonly<{ dictionary: Dictionary; row: AdminUserSummary }>) {
  const label = storeStateLabel(dictionary, row.storeState);
  return (
    <StatusBadge
      label={label}
      tone={row.storeState === "active" ? "success" : row.storeState === "configured" ? "warning" : "neutral"}
    />
  );
}

// Row actions: edit navigates to the read-only detail (10.3.3's editor
// contract) and delete posts the delivered byte-frozen soft-delete route;
// final-active-administrator protection stays server-side only.
function RowActions({ dictionary, row }: Readonly<{ dictionary: Dictionary; row: AdminUserSummary }>) {
  if (row.state === "deleted") return null;
  return (
    <span className="flex items-center gap-2">
      <Button asChild data-ds-hit-target variant="outline">
        <Link href={`/admin/accounts/${row.id}`}>{dictionary.adminUsersDirectoryEdit}</Link>
      </Button>
      <DestructiveActionForm
        action={`/admin/users/${row.id}/delete`}
        cancelLabel={dictionary.cancel}
        confirmLabel={dictionary.adminUsersDirectoryDelete}
        confirmation={{
          expectedValue: row.username,
          label: dictionary.adminUsersDirectoryDeleteConfirmFieldLabel,
        }}
        dialogDescription={dictionary.adminUsersDirectoryDeleteConfirmDescription}
        dialogTitle={dictionary.adminUsersDirectoryDeleteConfirmTitle}
        failureMessage={dictionary.adminUsersDirectoryDeleteConfirmFailure}
        pendingLabel={dictionary.loading}
        triggerLabel={dictionary.adminUsersDirectoryDelete}
      />
    </span>
  );
}

function AdminUserDirectory({
  dictionary,
  locale,
  page,
  query,
}: Readonly<{
  dictionary: Dictionary;
  locale: SupportedLocale;
  page: Extract<AdminUserDirectoryResult, { status: "ready" }> | null;
  query: Extract<ReturnType<typeof resolveAdminAccountsDirectoryQuery>, { status: "ready" }>;
}>) {
  const copy = dataDirectoryCopy(dictionary, {
    title: dictionary.adminUsersDirectoryEmpty,
    description: dictionary.adminUsersDirectoryEmptyDescription,
  });
  const columns: readonly DataDirectoryColumn<AdminUserSummary>[] = [
    { id: "username", label: dictionary.adminUsersDirectoryColumnUsername, value: (row) => <UsernameCell dictionary={dictionary} row={row} /> },
    { id: "email", label: dictionary.adminUsersDirectoryColumnEmail, value: (row) => <span className="text-sm text-muted-foreground">{row.email ?? dictionary.adminNotProvided}</span> },
    { id: "role", label: dictionary.adminUsersDirectoryColumnRole, value: (row) => <RoleBadge dictionary={dictionary} row={row} /> },
    { id: "state", label: dictionary.adminUsersDirectoryColumnState, value: (row) => <StateBadge dictionary={dictionary} row={row} /> },
    { id: "store", label: dictionary.adminUsersDirectoryColumnStore, value: (row) => <StoreBadge dictionary={dictionary} row={row} /> },
    { id: "created", label: dictionary.adminUsersDirectoryColumnCreated, numeric: true, value: (row) => <span className="font-mono">{formatAccountInstant(row.createdAt, locale)}</span> },
    { id: "lastActivity", label: dictionary.adminUsersDirectoryColumnLastActivity, numeric: true, value: (row) => <span className="font-mono">{row.lastActivityAt ? formatAccountInstant(row.lastActivityAt, locale) : dictionary.adminUsersDirectoryLastActivityNever}</span> },
  ];

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
      canonicalFilterQuery={query.query.canonicalFilterQuery}
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
      getRowHref={(row) => (row.state === "deleted" ? undefined : `/admin/accounts/${row.id}`)}
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
  if (query.status === "invalid-query") redirect(directoryInvalidFiltersLocation(ADMIN_USER_DIRECTORY_PATH));

  let page: Extract<AdminUserDirectoryResult, { status: "ready" }> | null = null;
  let serviceRedirect: string | null = null;
  try {
    const result = await queryAdminUserDirectory(adminAccountsCanonicalTarget(query));
    // The delivered service rejects ungrammatical calendar days after
    // canonicalization; that is the same zero-I/O invalid-query state, routed
    // the same way as a page-level invalid query.
    if (result.status === "ready") page = result;
    else if (result.status === "invalid-query") serviceRedirect = directoryInvalidFiltersLocation(ADMIN_USER_DIRECTORY_PATH);
    else serviceRedirect = result.location;
  } catch {
    page = null;
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
      <DirectoryInvalidFiltersNotice dictionary={dictionary} />
      <AdminUserDirectory dictionary={dictionary} locale={locale} page={page} query={query} />
    </AdminAccountsSurface>
  );
}
