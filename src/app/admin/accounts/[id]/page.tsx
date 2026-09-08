import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ChevronRightIcon, CircleCheckIcon, TriangleAlertIcon } from "lucide-react";

import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getAdminUserDirectoryService, type AdminUserDetail } from "@/auth/admin-user-directory";
import { getAdminUserProfileService } from "@/auth/admin-user-profile";
import { getTotpService } from "@/auth/totp-store";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Monogram } from "@/components/ui/monogram";
import { AccountStateBadge, StatusBadge, type AccountState } from "@/components/ui/status-badge";
import type { SimpleTab } from "@/components/ui/simple-tabs";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

import { requireAdminShellContext } from "../../shell-context";
import { formatAccountInstant } from "../instant";
import { AccessSection } from "./access-section";
import { AccountEditorTabs } from "./account-editor-tabs";
import { DangerSection } from "./danger-section";
import { IdentityForm } from "./identity-form";
import { PreferencesSection } from "./preferences-section";
import { StorefrontSection } from "./storefront-section";

type Dictionary = ReturnType<typeof getDictionary>;
type Notice = Readonly<{ tone: "success" | "error"; text: string }>;

// The closed editor notice set: unknown values render nothing (no echo).
function resolveEditorNotice(dictionary: Dictionary, value: string | readonly string[] | undefined): Notice | null {
  const notice = typeof value === "string" ? value : value?.[0];
  if (notice === "changed") return { tone: "success", text: dictionary.adminUserProfileChanged };
  if (notice === "conflict") return { tone: "error", text: dictionary.adminUserProfileConflict };
  if (notice === "failed") return { tone: "error", text: dictionary.adminUserProfileFailed };
  return null;
}

function resolveResetNotice(dictionary: Dictionary, value: string | readonly string[] | undefined): Notice | null {
  const notice = typeof value === "string" ? value : value?.[0];
  if (notice === "requested") return { tone: "success", text: dictionary.adminUserProfilePasswordResetRequested };
  if (notice === "failed") return { tone: "error", text: dictionary.adminUserProfilePasswordResetFailed };
  return null;
}

function resolveTotpNotice(dictionary: Dictionary, value: string | readonly string[] | undefined): Notice | null {
  const notice = typeof value === "string" ? value : value?.[0];
  if (notice === "totp-disabled") return { tone: "success", text: dictionary.adminUserProfileTotpDisabled };
  if (notice === "failed") return { tone: "error", text: dictionary.adminUserProfileTotpDisableFailed };
  return null;
}

function EditorNotice({ dictionary, notice }: Readonly<{ dictionary: Dictionary; notice: Notice }>) {
  const success = notice.tone === "success";
  const Icon = success ? CircleCheckIcon : TriangleAlertIcon;
  return (
    <Alert aria-live={success ? "polite" : "assertive"} role={success ? "status" : "alert"} variant={success ? "success" : "destructive"}>
      <Icon aria-hidden="true" />
      <AlertTitle>{success ? dictionary.adminSuccessHeading : dictionary.adminErrorHeading}</AlertTitle>
      <AlertDescription>{notice.text}</AlertDescription>
    </Alert>
  );
}

function roleTone(role: AdminUserDetail["role"]): "info" | "neutral" {
  return role === "ADMIN" ? "info" : "neutral";
}

function stateLabels(dictionary: Dictionary): Readonly<Record<AccountState, string>> {
  return {
    active: dictionary.adminActive,
    disabled: dictionary.adminDisabled,
    deleted: dictionary.adminUsersDirectoryStateDeleted,
  };
}

function storeLabel(dictionary: Dictionary, detail: AdminUserDetail) {
  return detail.storeState === "active"
    ? dictionary.adminUsersDirectoryStoreActive
    : detail.storeState === "configured"
      ? dictionary.adminUsersDirectoryStoreConfigured
      : dictionary.adminUsersDirectoryStoreNone;
}

// The header is common to both the deleted and the live rendering: monogram,
// username (struck through once deleted), role pill, and the account state.
function AccountHeader({ detail, dictionary }: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary }>) {
  return (
    <header className="flex flex-wrap items-center gap-4">
      <Monogram name={detail.username} size="xl" />
      <div>
        <h1 className={`font-display text-2xl leading-8 font-semibold ${detail.deletedAt !== null ? "line-through" : ""}`}>
          {detail.username}
        </h1>
        <div className="mt-1 flex items-center gap-2">
          <StatusBadge label={detail.role === "ADMIN" ? dictionary.adminAdministrator : dictionary.adminUser} tone={roleTone(detail.role)} />
          <AccountStateBadge labels={stateLabels(dictionary)} state={detail.state} />
        </div>
      </div>
    </header>
  );
}

// A deleted target renders the banner plus this read-only facts card only:
// no tabs, no danger panel, no mutation form.
function DeletedAccountFacts({
  detail,
  dictionary,
  locale,
}: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary; locale: SupportedLocale }>) {
  const facts = [
    { label: dictionary.adminUsersDirectoryColumnEmail, value: detail.email ?? dictionary.adminNotProvided },
    { label: dictionary.adminUsersDirectoryColumnRole, value: <StatusBadge label={detail.role === "ADMIN" ? dictionary.adminAdministrator : dictionary.adminUser} tone={roleTone(detail.role)} /> },
    { label: dictionary.adminUsersDirectoryColumnState, value: <AccountStateBadge labels={stateLabels(dictionary)} state={detail.state} /> },
    { label: dictionary.adminUsersDirectoryColumnStore, value: <StatusBadge label={storeLabel(dictionary, detail)} tone={detail.storeState === "active" ? "success" : detail.storeState === "configured" ? "warning" : "neutral"} /> },
    { label: dictionary.adminUsersDirectoryDetailStorefrontSlug, value: detail.storefrontSlug ?? dictionary.adminNotProvided },
    { label: dictionary.adminUsersDirectoryColumnCreated, value: <span className="font-mono">{formatAccountInstant(detail.createdAt, locale)}</span> },
    { label: dictionary.adminUsersDirectoryColumnLastActivity, value: detail.lastActivityAt ? <span className="font-mono">{formatAccountInstant(detail.lastActivityAt, locale)}</span> : dictionary.adminUsersDirectoryLastActivityNever },
  ];

  return (
    <Card>
      <CardContent>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {facts.map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-3 border-b border-border py-1.5">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
      <CardFooter>
        <Button asChild data-ds-hit-target variant="outline">
          <Link href="/admin/accounts">{dictionary.adminUsersDirectoryDetailBack}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function DeletedBanner({ dictionary }: Readonly<{ dictionary: Dictionary }>) {
  return (
    <Alert role="status" variant="warning">
      <TriangleAlertIcon aria-hidden="true" />
      <AlertDescription>{dictionary.adminUsersDirectoryStateDeleted}</AlertDescription>
    </Alert>
  );
}

// The one opaque unavailable outcome covers malformed, missing, and every
// other non-resolvable identity; nothing about the target is disclosed.
function AccountUnavailableCard({ dictionary }: Readonly<{ dictionary: Dictionary }>) {
  return (
    <Card>
      <CardContent>
        <h2 className="font-display text-lg font-semibold">{dictionary.adminUsersDirectoryDetailUnavailable}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{dictionary.adminUsersDirectoryDetailUnavailableDescription}</p>
      </CardContent>
      <CardFooter>
        <Button asChild data-ds-hit-target variant="outline">
          <Link href="/admin/accounts">{dictionary.adminUsersDirectoryDetailBack}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

// The accent swatch reads the live accent color as a CSS custom property;
// `scripts/check-design-tokens.mjs` allow-lists this exact expression at
// this exact path, so it stays here and is threaded into `StorefrontSection`
// rather than duplicated as a second literal in an owned client file.
function AccentColorField({ detail, dictionary }: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary }>) {
  const editor = detail.editor;
  return (
    <Field>
      <FieldLabel htmlFor={`storefront-accent-${detail.id}`}>{dictionary.storefrontAccentColorLabel}</FieldLabel>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="size-10 rounded-md border border-border bg-[var(--storefront-accent)]"
          style={{ "--storefront-accent": editor.storefrontAccentColor ?? "transparent" } as CSSProperties}
        />
        <Input
          aria-describedby={`storefront-accent-help-${detail.id}`}
          className="font-mono"
          defaultValue={editor.storefrontAccentColor ?? ""}
          id={`storefront-accent-${detail.id}`}
          maxLength={7}
          name="storefrontAccentColor"
          placeholder="#RRGGBB"
        />
      </div>
      <FieldDescription id={`storefront-accent-help-${detail.id}`}>{dictionary.storefrontAccentColorHelp}</FieldDescription>
    </Field>
  );
}

function TabPanelCard({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Card>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function AdminAccountDetailPage({
  params,
  searchParams = Promise.resolve({}),
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams?: Promise<Readonly<Record<string, string | readonly string[] | undefined>>>;
}>) {
  const { dictionary, locale, principal } = await requireAdminShellContext();
  const detail = await getAdminUserDirectoryService().getAdminUserDetail(principal, (await params).id);
  const notice = resolveEditorNotice(dictionary, (await searchParams).editor)
    ?? resolveResetNotice(dictionary, (await searchParams).reset)
    ?? resolveTotpNotice(dictionary, (await searchParams).editor);
  // The currency select reads only the redacted active choices, and only when
  // the storefront form actually renders.
  const currencyChoices = detail !== null && detail.state !== "deleted"
    ? await getAdminUserProfileService().listActiveCurrencyChoices(principal)
    : [];
  const totpConfigured = detail !== null && detail.state !== "deleted"
    ? (await getTotpService().getStatus(detail.id)) !== "none"
    : false;

  const tabs: readonly SimpleTab[] = detail !== null && detail.state !== "deleted"
    ? [
      { id: "identity", label: dictionary.adminUserProfileSectionIdentity, content: <TabPanelCard><IdentityForm detail={detail} dictionary={dictionary} /></TabPanelCard> },
      { id: "access", label: dictionary.adminUserProfileSectionAccess, content: <TabPanelCard><AccessSection detail={detail} dictionary={dictionary} totpConfigured={totpConfigured} /></TabPanelCard> },
      { id: "storefront", label: dictionary.adminUserProfileSectionStorefront, content: <TabPanelCard><StorefrontSection accentField={<AccentColorField detail={detail} dictionary={dictionary} />} currencyChoices={currencyChoices} detail={detail} dictionary={dictionary} /></TabPanelCard> },
      { id: "preferences", label: dictionary.adminUserProfileSectionPreferences, content: <TabPanelCard><PreferencesSection detail={detail} dictionary={dictionary} /></TabPanelCard> },
      { id: "danger", label: dictionary.adminUserProfileSectionDanger, content: <DangerSection detail={detail} dictionary={dictionary} /> },
    ]
    : [];

  return (
    <>
      <WorkspaceHeading description={dictionary.adminUsersDirectoryDescription} eyebrow={dictionary.shellAdminEyebrow} title={dictionary.adminUsersHeading} />
      {notice ? <EditorNotice dictionary={dictionary} notice={notice} /> : null}
      {detail === null ? (
        <AccountUnavailableCard dictionary={dictionary} />
      ) : (
        <div className="space-y-6">
          <nav aria-label={dictionary.adminUserProfileBreadcrumbLabel} className="flex min-h-11 items-center gap-1 text-sm text-muted-foreground">
            <Link href="/admin/accounts" className="inline-flex min-h-11 items-center hover:text-foreground">
              {dictionary.adminUsersHeading}
            </Link>
            <ChevronRightIcon className="size-3.5" aria-hidden />
            <span className={`font-mono ${detail.deletedAt !== null ? "line-through" : ""}`}>{detail.username}</span>
          </nav>

          <AccountHeader detail={detail} dictionary={dictionary} />

          {detail.state === "deleted" ? (
            <>
              <DeletedBanner dictionary={dictionary} />
              <DeletedAccountFacts detail={detail} dictionary={dictionary} locale={locale} />
            </>
          ) : (
            <AccountEditorTabs ariaLabel={dictionary.adminUserProfileSectionsLabel} tabs={tabs} />
          )}
        </div>
      )}
    </>
  );
}
