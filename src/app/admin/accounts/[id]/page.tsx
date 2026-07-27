import Link from "next/link";

import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getAdminUserDirectoryService, type AdminUserDetail } from "@/auth/admin-user-directory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

import { requireAdminShellContext } from "../../shell-context";
import { formatAccountInstant } from "../instant";

type Dictionary = ReturnType<typeof getDictionary>;

// Read-only administrator account detail (10.3.2): the row facts plus the
// storefront slug, with the delivered soft-delete form as the only action.
// 10.3.3 extends this same route into the profile editor and must not move it.
function AccountDetailCard({
  detail,
  dictionary,
  locale,
}: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary; locale: SupportedLocale }>) {
  const stateLabel = detail.state === "deleted"
    ? dictionary.adminUsersDirectoryStateDeleted
    : detail.state === "disabled"
      ? dictionary.adminDisabled
      : dictionary.adminActive;
  const storeLabel = detail.storeState === "active"
    ? dictionary.adminUsersDirectoryStoreActive
    : detail.storeState === "configured"
      ? dictionary.adminUsersDirectoryStoreConfigured
      : dictionary.adminUsersDirectoryStoreNone;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {detail.username}
          {detail.deletedAt !== null ? <> <Badge variant="outline">{dictionary.adminUsersDirectoryStateDeleted}</Badge></> : null}
        </CardTitle>
        <CardDescription>{dictionary.adminUsersDirectoryDetailDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl>
          <div><dt>{dictionary.adminUsersDirectoryColumnEmail}</dt><dd>{detail.email ?? dictionary.adminNotProvided}</dd></div>
          <div><dt>{dictionary.adminUsersDirectoryColumnRole}</dt><dd><Badge variant="outline">{detail.role === "ADMIN" ? dictionary.adminAdministrator : dictionary.adminUser}</Badge></dd></div>
          <div><dt>{dictionary.adminUsersDirectoryColumnState}</dt><dd>{stateLabel}</dd></div>
          <div><dt>{dictionary.adminUsersDirectoryColumnStore}</dt><dd>{storeLabel}</dd></div>
          <div><dt>{dictionary.adminUsersDirectoryDetailStorefrontSlug}</dt><dd>{detail.storefrontSlug ?? dictionary.adminNotProvided}</dd></div>
          <div><dt>{dictionary.adminUsersDirectoryColumnCreated}</dt><dd>{formatAccountInstant(detail.createdAt, locale)}</dd></div>
          <div><dt>{dictionary.adminUsersDirectoryColumnLastActivity}</dt><dd>{detail.lastActivityAt ? formatAccountInstant(detail.lastActivityAt, locale) : dictionary.adminUsersDirectoryLastActivityNever}</dd></div>
        </dl>
      </CardContent>
      <CardFooter>
        <Button asChild data-ds-hit-target variant="outline"><Link href="/admin/accounts">{dictionary.adminUsersDirectoryDetailBack}</Link></Button>
        {detail.state !== "deleted" ? (
          <form action={`/admin/users/${detail.id}/delete`} method="post">
            <Button data-ds-hit-target type="submit" variant="destructive">{dictionary.adminUsersDirectoryDelete}</Button>
          </form>
        ) : null}
      </CardFooter>
    </Card>
  );
}

// The one opaque unavailable outcome covers malformed, missing, and every
// other non-resolvable identity; nothing about the target is disclosed.
function AccountUnavailableCard({ dictionary }: Readonly<{ dictionary: Dictionary }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.adminUsersDirectoryDetailUnavailable}</CardTitle>
        <CardDescription>{dictionary.adminUsersDirectoryDetailUnavailableDescription}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button asChild data-ds-hit-target variant="outline"><Link href="/admin/accounts">{dictionary.adminUsersDirectoryDetailBack}</Link></Button>
      </CardFooter>
    </Card>
  );
}

export default async function AdminAccountDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { dictionary, locale, principal } = await requireAdminShellContext();
  const detail = await getAdminUserDirectoryService().getAdminUserDetail(principal, (await params).id);

  return (
    <>
      <WorkspaceHeading description={dictionary.adminUsersDirectoryDescription} eyebrow={dictionary.shellAdminEyebrow} title={dictionary.adminUsersHeading} />
      {detail !== null
        ? <AccountDetailCard detail={detail} dictionary={dictionary} locale={locale} />
        : <AccountUnavailableCard dictionary={dictionary} />}
    </>
  );
}
