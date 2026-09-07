import Link from "next/link";
import type { CSSProperties } from "react";
import { ChevronRightIcon, CircleCheckIcon, TriangleAlertIcon } from "lucide-react";

import { AccountMutationForm } from "@/app/admin/account-mutation-form";
import { AdminSubmit } from "@/app/admin/admin-submit";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getAdminUserDirectoryService, type AdminUserDetail } from "@/auth/admin-user-directory";
import { getAdminUserProfileService } from "@/auth/admin-user-profile";
import { getTotpService } from "@/auth/totp-store";
import { CHECKOUT_DATA_POLICIES } from "@/auth/checkout-policy";
import type { ExchangeCurrencyChoice } from "@/auth/supported-exchange-currency";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Monogram } from "@/components/ui/monogram";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { StatusBadge } from "@/components/ui/status-badge";
import { DEFAULT_STOREFRONT_THEME_ID, STOREFRONT_THEME_IDS } from "@/design-system/themes";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

import { requireAdminShellContext } from "../../shell-context";
import { DestructiveActionForm } from "../destructive-confirm";
import { formatAccountInstant } from "../instant";

type Dictionary = ReturnType<typeof getDictionary>;
type Notice = Readonly<{ tone: "success" | "error"; text: string }>;

const SECTIONS = [
  { id: "identity", anchor: "identity" },
  { id: "access", anchor: "access" },
  { id: "security", anchor: "security" },
  { id: "preferences", anchor: "preferences" },
  { id: "storefront", anchor: "storefront" },
  { id: "danger", anchor: "danger" },
] as const;

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

function stateTone(state: AdminUserDetail["state"]): "success" | "warning" | "danger" {
  return state === "active" ? "success" : state === "disabled" ? "warning" : "danger";
}

function stateLabel(dictionary: Dictionary, detail: AdminUserDetail) {
  return detail.state === "deleted"
    ? dictionary.adminUsersDirectoryStateDeleted
    : detail.state === "disabled"
      ? dictionary.adminDisabled
      : dictionary.adminActive;
}

function storeLabel(dictionary: Dictionary, detail: AdminUserDetail) {
  return detail.storeState === "active"
    ? dictionary.adminUsersDirectoryStoreActive
    : detail.storeState === "configured"
      ? dictionary.adminUsersDirectoryStoreConfigured
      : dictionary.adminUsersDirectoryStoreNone;
}

// The account facts stay read-only on the editor route; the administrator DTO
// and derived facts are the same ones the directory renders.
function AccountFactsCard({
  detail,
  dictionary,
  locale,
}: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary; locale: SupportedLocale }>) {
  const facts = [
    { label: dictionary.adminUsersDirectoryColumnEmail, value: detail.email ?? dictionary.adminNotProvided },
    { label: dictionary.adminUsersDirectoryColumnRole, value: <StatusBadge label={detail.role === "ADMIN" ? dictionary.adminAdministrator : dictionary.adminUser} tone={roleTone(detail.role)} /> },
    { label: dictionary.adminUsersDirectoryColumnState, value: <StatusBadge label={stateLabel(dictionary, detail)} tone={stateTone(detail.state)} /> },
    { label: dictionary.adminUsersDirectoryColumnStore, value: <StatusBadge label={storeLabel(dictionary, detail)} tone={detail.storeState === "active" ? "success" : detail.storeState === "configured" ? "warning" : "neutral"} /> },
    { label: dictionary.adminUsersDirectoryDetailStorefrontSlug, value: detail.storefrontSlug ?? dictionary.adminNotProvided },
    { label: dictionary.adminUsersDirectoryColumnCreated, value: <span className="font-mono">{formatAccountInstant(detail.createdAt, locale)}</span> },
    { label: dictionary.adminUsersDirectoryColumnLastActivity, value: detail.lastActivityAt ? <span className="font-mono">{formatAccountInstant(detail.lastActivityAt, locale)}</span> : dictionary.adminUsersDirectoryLastActivityNever },
  ];

  return (
    <Card>
      <CardContent>
        <header className="flex flex-wrap items-center gap-4">
          <Monogram name={detail.username} size="lg" />
          <div>
            <h2 className={`font-display text-2xl leading-8 font-semibold ${detail.deletedAt !== null ? "line-through" : ""}`}>
              {detail.username}
            </h2>
            <div className="mt-1 flex items-center gap-2">
              <StatusBadge label={detail.role === "ADMIN" ? dictionary.adminAdministrator : dictionary.adminUser} tone={roleTone(detail.role)} />
              <StatusBadge label={stateLabel(dictionary, detail)} tone={stateTone(detail.state)} />
            </div>
          </div>
        </header>
        <dl className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
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

function SectionNav({ dictionary }: Readonly<{ dictionary: Dictionary }>) {
  return (
    <nav aria-label={dictionary.adminUserProfileSectionsLabel} className="flex flex-wrap gap-2">
      {SECTIONS.map((section) => (
        <Button asChild key={section.id} variant="ghost">
          <a href={`#${section.anchor}`}>{dictionary[`adminUserProfileSection${section.id.charAt(0).toUpperCase() + section.id.slice(1)}` as keyof Dictionary]}</a>
        </Button>
      ))}
    </nav>
  );
}

function SectionCard({
  anchor,
  children,
  description,
  number,
  title,
}: Readonly<{ anchor: string; children: React.ReactNode; description: string; number: number; title: string }>) {
  return (
    <Card id={anchor}>
      <CardHeader>
        <CardTitle>
          <span aria-hidden="true">{number}. </span>
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// Identity edit posts the expected-version CAS; a stale form or a unique
// collision lands on the one conflict notice.
function IdentityCard({ detail, dictionary, number }: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary; number: number }>) {
  return (
    <SectionCard
      anchor="identity"
      description={dictionary.adminUserProfileIdentityDescription}
      number={number}
      title={dictionary.adminUserProfileIdentityHeading}
    >
      <form action={`/admin/users/${detail.id}/identity`} method="post">
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Input name="expectedVersion" readOnly type="hidden" value={String(detail.editor.profileVersion)} />
          <Field>
            <FieldLabel htmlFor={`identity-username-${detail.id}`}>{dictionary.usernameLabel}</FieldLabel>
            <Input autoComplete="off" className="font-mono" defaultValue={detail.username} id={`identity-username-${detail.id}`} name="username" required />
          </Field>
          <Field>
            <FieldLabel htmlFor={`identity-email-${detail.id}`}>{dictionary.adminEmailLabel}</FieldLabel>
            <Input autoComplete="off" defaultValue={detail.email ?? ""} id={`identity-email-${detail.id}`} name="email" type="email" />
          </Field>
        </FieldGroup>
        <div className="mt-5 flex justify-end">
          <AdminSubmit label={dictionary.adminUserProfileIdentitySave} tone="secondary" />
        </div>
      </form>
    </SectionCard>
  );
}

// Role, status, and password reset re-house the legacy inline forms on their
// byte-frozen routes; those routes land on the accounts workspace notices.
function AccessCard({ detail, dictionary, number }: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary; number: number }>) {
  return (
    <SectionCard
      anchor="access"
      description={dictionary.adminUserProfileAccessDescription}
      number={number}
      title={dictionary.adminUserProfileAccessHeading}
    >
      <div className="space-y-6">
        <AccountMutationForm
          action={`/admin/users/${detail.id}/role`}
          cancelLabel={dictionary.adminCancel}
          confirmDescription={dictionary.adminDemotionDescription}
          confirmLabel={dictionary.adminConfirmDemotion}
          confirmTitle={dictionary.adminDemotionTitle}
          currentValue={detail.role}
          destructiveValue="USER"
          fieldLabel={dictionary.adminRoleLabel}
          name="role"
          options={[{ value: "USER", label: dictionary.adminUser }, { value: "ADMIN", label: dictionary.adminAdministrator }]}
          saveLabel={dictionary.adminSaveRole}
        />
        <AccountMutationForm
          action={`/admin/users/${detail.id}/status`}
          cancelLabel={dictionary.adminCancel}
          confirmDescription={dictionary.adminDisableDescription}
          confirmLabel={dictionary.adminConfirmDisable}
          confirmTitle={dictionary.adminDisableTitle}
          currentValue={detail.status}
          destructiveValue="DISABLED"
          fieldLabel={dictionary.adminStatusLabel}
          name="status"
          options={[{ value: "ACTIVE", label: dictionary.adminActive }, { value: "DISABLED", label: dictionary.adminDisabled }]}
          saveLabel={dictionary.adminSaveStatus}
        />
        <div className="flex items-center justify-between border-t border-border pt-4">
          <div>
            <p className="text-sm font-medium">{dictionary.adminChangePassword}</p>
            <p className="text-xs text-muted-foreground">{dictionary.adminPasswordHelp}</p>
          </div>
          <form action={`/admin/users/${detail.id}/password`} method="post">
            <FieldGroup className="flex items-end gap-3">
              <Field>
                <FieldLabel htmlFor={`password-${detail.id}`}>{dictionary.passwordLabel}</FieldLabel>
                <Input aria-describedby={`password-help-${detail.id}`} autoComplete="new-password" className="font-mono" id={`password-${detail.id}`} minLength={12} name="password" required type="password" />
              </Field>
              <AdminSubmit label={dictionary.adminChangePassword} tone="secondary" />
            </FieldGroup>
          </form>
        </div>
      </div>
    </SectionCard>
  );
}

// The password reset request sends a single-use link to the account's
// contact email; every outcome collapses to one opaque redirect.
function PasswordResetCard({ detail, dictionary, number }: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary; number: number }>) {
  return (
    <SectionCard
      anchor="security"
      description={dictionary.adminUserProfilePasswordResetDescription}
      number={number}
      title={dictionary.adminUserProfilePasswordResetHeading}
    >
      <form action={`/admin/users/${detail.id}/reset-password`} method="post">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{dictionary.adminUserProfilePasswordResetDescription}</p>
          <AdminSubmit label={dictionary.adminUserProfilePasswordResetSend} tone="secondary" />
        </div>
      </form>
    </SectionCard>
  );
}

// TOTP recovery lets an administrator remove a configured second factor when
// the account lost access to the authenticator or recovery codes.
function TotpRecoveryCard({
  configured,
  detail,
  dictionary,
}: Readonly<{ configured: boolean; detail: AdminUserDetail; dictionary: Dictionary }>) {
  return (
    <div className="border-t border-border pt-4">
      <div className="flex items-start gap-3 text-sm text-muted-foreground">
        <TriangleAlertIcon className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <p>{configured ? dictionary.adminUserProfileTotpConfigured : dictionary.adminUserProfileTotpNotConfigured}</p>
      </div>
      {configured && (
        <div className="mt-4">
          <DestructiveActionForm
            action={`/admin/users/${detail.id}/totp-disable`}
            cancelLabel={dictionary.cancel}
            confirmLabel={dictionary.adminUserProfileTotpDisable}
            dialogDescription={dictionary.adminUserProfileTotpDisableConfirmDescription}
            dialogTitle={dictionary.adminUserProfileTotpDisableConfirmTitle}
            failureMessage={dictionary.adminUserProfileTotpDisableFailed}
            pendingLabel={dictionary.loading}
            triggerLabel={dictionary.adminUserProfileTotpDisable}
          />
        </div>
      )}
    </div>
  );
}

function LocaleForm({ detail, dictionary }: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary }>) {
  return (
    <form action={`/admin/users/${detail.id}/locale`} method="post">
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`locale-${detail.id}`}>{dictionary.adminUserProfileLocaleLabel}</FieldLabel>
          <NativeSelect defaultValue={detail.editor.preferredLocale ?? ""} id={`locale-${detail.id}`} name="locale">
            <NativeSelectOption value="">{dictionary.adminUserProfileLocaleClear}</NativeSelectOption>
            <NativeSelectOption value="pt-BR">Português (Brasil)</NativeSelectOption>
            <NativeSelectOption value="en">English</NativeSelectOption>
          </NativeSelect>
        </Field>
      </FieldGroup>
      <div className="mt-5 flex justify-end">
        <AdminSubmit label={dictionary.adminUserProfileLocaleSave} tone="secondary" />
      </div>
    </form>
  );
}

const CHECKOUT_POLICY_LABELS: Record<string, keyof Dictionary> = {
  NONE: "checkoutPolicyNone",
  NAME_EMAIL: "checkoutPolicyNameEmail",
  EMAIL: "checkoutPolicyEmail",
  NAME_EMAIL_CPF: "checkoutPolicyNameEmailCpf",
  NAME_EMAIL_CPF_ADDRESS: "checkoutPolicyNameEmailCpfAddress",
};

function CheckoutPolicyForm({ detail, dictionary }: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary }>) {
  return (
    <form action={`/admin/users/${detail.id}/checkout-policy`} method="post">
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`checkout-policy-${detail.id}`}>{dictionary.checkoutPolicyLabel}</FieldLabel>
          <NativeSelect defaultValue={detail.editor.checkoutDataPolicy} id={`checkout-policy-${detail.id}`} name="policy">
            {CHECKOUT_DATA_POLICIES.map((policy) => (
              <NativeSelectOption key={policy} value={policy}>{dictionary[CHECKOUT_POLICY_LABELS[policy] ?? "checkoutPolicyNone"]}</NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </FieldGroup>
      <div className="mt-5 flex justify-end">
        <AdminSubmit label={dictionary.adminUserProfileCheckoutSave} tone="secondary" />
      </div>
    </form>
  );
}

// Locale and checkout policy share one preferences section so the local
// anchor navigation has a single stable target and no duplicated id.
function PreferencesCard({ detail, dictionary, number }: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary; number: number }>) {
  return (
    <SectionCard
      anchor="preferences"
      description={dictionary.adminUserProfileLocaleDescription}
      number={number}
      title={dictionary.adminUserProfileSectionPreferences}
    >
      <div className="space-y-6">
        <LocaleForm detail={detail} dictionary={dictionary} />
        <CheckoutPolicyForm detail={detail} dictionary={dictionary} />
      </div>
    </SectionCard>
  );
}

// The administrator storefront correction form edits exactly the nine
// sanctioned fields; the owner-fenced logo media identifier never renders.
function StorefrontCard({
  currencyChoices,
  detail,
  dictionary,
  number,
}: Readonly<{ currencyChoices: readonly ExchangeCurrencyChoice[]; detail: AdminUserDetail; dictionary: Dictionary; number: number }>) {
  const editor = detail.editor;
  const themeNames: Record<string, string> = {
    "pix-paper": dictionary.storefrontThemePixPaper,
    "cashier-daylight": dictionary.storefrontThemeCashierDaylight,
    "settlement-sand": dictionary.storefrontThemeSettlementSand,
    "midnight-clearing": dictionary.storefrontThemeMidnightClearing,
    "vault-blue": dictionary.storefrontThemeVaultBlue,
    "terminal-amber": dictionary.storefrontThemeTerminalAmber,
  };
  const storedCurrencyMissing = editor.storefrontDefaultCurrencyCode !== null
    && !currencyChoices.some((choice) => choice.code === editor.storefrontDefaultCurrencyCode);
  const storeUrl = detail.storefrontSlug !== null && editor.storefrontEnabled ? `/store/${detail.storefrontSlug}` : null;

  return (
    <SectionCard
      anchor="storefront"
      description={dictionary.adminUserProfileStorefrontDescription}
      number={number}
      title={dictionary.adminUserProfileStorefrontHeading}
    >
      <form action={`/admin/users/${detail.id}/storefront`} method="post">
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`storefront-slug-${detail.id}`}>{dictionary.storefrontSlugLabel}</FieldLabel>
            <Input aria-describedby={`storefront-slug-help-${detail.id}`} className="font-mono" defaultValue={detail.storefrontSlug ?? ""} id={`storefront-slug-${detail.id}`} maxLength={63} name="storefrontSlug" />
            <FieldDescription id={`storefront-slug-help-${detail.id}`}>{dictionary.storefrontSlugHelp}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={`storefront-accent-${detail.id}`}>{dictionary.storefrontAccentColorLabel}</FieldLabel>
            <div className="flex items-center gap-2">
              <span className="size-10 rounded-md border border-border bg-[var(--storefront-accent)]" style={{ "--storefront-accent": editor.storefrontAccentColor ?? "transparent" } as CSSProperties} aria-hidden />
              <Input aria-describedby={`storefront-accent-help-${detail.id}`} className="font-mono" defaultValue={editor.storefrontAccentColor ?? ""} id={`storefront-accent-${detail.id}`} maxLength={7} name="storefrontAccentColor" placeholder="#RRGGBB" />
            </div>
            <FieldDescription id={`storefront-accent-help-${detail.id}`}>{dictionary.storefrontAccentColorHelp}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={`storefront-name-pt-${detail.id}`}>{dictionary.storefrontDisplayNamePtBrLabel}</FieldLabel>
            <Input defaultValue={editor.storefrontDisplayNamePtBr ?? ""} id={`storefront-name-pt-${detail.id}`} maxLength={160} name="storefrontDisplayNamePtBr" />
          </Field>
          <Field>
            <FieldLabel htmlFor={`storefront-name-en-${detail.id}`}>{dictionary.storefrontDisplayNameEnLabel}</FieldLabel>
            <Input defaultValue={editor.storefrontDisplayNameEn ?? ""} id={`storefront-name-en-${detail.id}`} maxLength={160} name="storefrontDisplayNameEn" />
          </Field>
          <Field>
            <FieldLabel htmlFor={`storefront-theme-${detail.id}`}>{dictionary.storefrontThemeLabel}</FieldLabel>
            <NativeSelect aria-describedby={`storefront-theme-help-${detail.id}`} defaultValue={editor.storefrontThemeId ?? DEFAULT_STOREFRONT_THEME_ID} id={`storefront-theme-${detail.id}`} name="storefrontThemeId">
              {STOREFRONT_THEME_IDS.map((id) => <NativeSelectOption key={id} value={id}>{themeNames[id] ?? id}</NativeSelectOption>)}
            </NativeSelect>
            <FieldDescription id={`storefront-theme-help-${detail.id}`}>{dictionary.storefrontThemeHelp}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={`storefront-layout-${detail.id}`}>{dictionary.storefrontLayoutLabel}</FieldLabel>
            <NativeSelect defaultValue={editor.storefrontLayout ?? "boxed"} id={`storefront-layout-${detail.id}`} name="storefrontLayout">
              <NativeSelectOption value="boxed">{dictionary.storefrontLayoutBoxed}</NativeSelectOption>
              <NativeSelectOption value="table">{dictionary.storefrontLayoutTable}</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`storefront-currency-${detail.id}`}>{dictionary.storefrontCurrencyLabel}</FieldLabel>
            <NativeSelect aria-describedby={`storefront-currency-help-${detail.id}`} defaultValue={editor.storefrontDefaultCurrencyCode ?? ""} id={`storefront-currency-${detail.id}`} name="storefrontDefaultCurrencyCode">
              <NativeSelectOption value="">{dictionary.storefrontCurrencyNone}</NativeSelectOption>
              {currencyChoices.map((choice) => <NativeSelectOption key={choice.code} value={choice.code}>{choice.label} ({choice.code})</NativeSelectOption>)}
              {storedCurrencyMissing ? <NativeSelectOption value={editor.storefrontDefaultCurrencyCode as string}>{editor.storefrontDefaultCurrencyCode}</NativeSelectOption> : null}
            </NativeSelect>
            <FieldDescription id={`storefront-currency-help-${detail.id}`}>
              {currencyChoices.length === 0 ? dictionary.storefrontCurrencyUnavailable : dictionary.storefrontCurrencyHelp}
            </FieldDescription>
          </Field>
        </FieldGroup>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-6">
            <Field orientation="horizontal">
              <Checkbox defaultChecked={editor.storefrontEnabled} id={`storefront-enabled-${detail.id}`} name="storefrontEnabled" value="true" />
              <FieldLabel htmlFor={`storefront-enabled-${detail.id}`}>{dictionary.storefrontEnabledLabel}</FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <Checkbox defaultChecked={editor.storefrontStandalonePaymentsEnabled} id={`storefront-standalone-${detail.id}`} name="storefrontStandalonePaymentsEnabled" value="true" />
              <FieldLabel htmlFor={`storefront-standalone-${detail.id}`}>{dictionary.storefrontStandalonePaymentsLabel}</FieldLabel>
            </Field>
          </div>
          <AdminSubmit label={dictionary.adminUserProfileStorefrontSave} tone="secondary" />
        </div>
      </form>
      {storeUrl !== null ? (
        <div className="mt-4 border-t border-border pt-4">
          <Button asChild data-ds-hit-target variant="outline">
            <Link href={storeUrl}>{dictionary.adminUserProfileStoreLink}</Link>
          </Button>
        </div>
      ) : (
        <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">{dictionary.adminUserProfileStoreUnavailable}</p>
      )}
    </SectionCard>
  );
}

// The delivered byte-frozen soft-delete route stays the only destructive
// action; it lands on the accounts workspace notices.
function DeleteCard({ detail, dictionary }: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary }>) {
  return (
    <Card id="danger" className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive">{dictionary.adminUserProfileDeleteHeading}</CardTitle>
        <CardDescription>{dictionary.adminUserProfileDeleteDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <DestructiveActionForm
          action={`/admin/users/${detail.id}/delete`}
          cancelLabel={dictionary.cancel}
          confirmLabel={dictionary.adminUsersDirectoryDelete}
          confirmation={{
            expectedValue: detail.username,
            label: dictionary.adminUserProfileDeleteConfirmFieldLabel,
          }}
          dialogDescription={dictionary.adminUserProfileDeleteDescription}
          dialogTitle={dictionary.adminUserProfileDeleteConfirmTitle}
          failureMessage={dictionary.adminUserProfileDeleteConfirmFailure}
          pendingLabel={dictionary.loading}
          triggerLabel={dictionary.adminUsersDirectoryDelete}
        />
      </CardContent>
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
        <Button asChild data-ds-hit-target variant="outline">
          <Link href="/admin/accounts">{dictionary.adminUsersDirectoryDetailBack}</Link>
        </Button>
      </CardFooter>
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

          <AccountFactsCard detail={detail} dictionary={dictionary} locale={locale} />

          {detail.state !== "deleted" ? (
            <>
              <SectionNav dictionary={dictionary} />
              <div className="space-y-6">
                <IdentityCard detail={detail} dictionary={dictionary} number={1} />
                <AccessCard detail={detail} dictionary={dictionary} number={2} />
                <PasswordResetCard detail={detail} dictionary={dictionary} number={3} />
                <TotpRecoveryCard configured={totpConfigured} detail={detail} dictionary={dictionary} />
                <PreferencesCard detail={detail} dictionary={dictionary} number={4} />
                <StorefrontCard currencyChoices={currencyChoices} detail={detail} dictionary={dictionary} number={5} />
                <DeleteCard detail={detail} dictionary={dictionary} />
              </div>
            </>
          ) : null}
        </div>
      )}
    </>
  );
}
