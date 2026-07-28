import Link from "next/link";
import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react";

import { AccountMutationForm } from "@/app/admin/account-mutation-form";
import { AdminSubmit } from "@/app/admin/admin-submit";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getAdminUserDirectoryService, type AdminUserDetail } from "@/auth/admin-user-directory";
import { getAdminUserProfileService } from "@/auth/admin-user-profile";
import { getTotpService } from "@/auth/totp-store";
import { CHECKOUT_DATA_POLICIES } from "@/auth/checkout-policy";
import type { ExchangeCurrencyChoice } from "@/auth/supported-exchange-currency";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { DEFAULT_STOREFRONT_THEME_ID, STOREFRONT_THEME_IDS } from "@/design-system/themes";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

import { requireAdminShellContext } from "../../shell-context";
import { formatAccountInstant } from "../instant";

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
          <div><dt>{dictionary.adminUsersDirectoryColumnState}</dt><dd>{stateLabel(dictionary, detail)}</dd></div>
          <div><dt>{dictionary.adminUsersDirectoryColumnStore}</dt><dd>{storeLabel(dictionary, detail)}</dd></div>
          <div><dt>{dictionary.adminUsersDirectoryDetailStorefrontSlug}</dt><dd>{detail.storefrontSlug ?? dictionary.adminNotProvided}</dd></div>
          <div><dt>{dictionary.adminUsersDirectoryColumnCreated}</dt><dd>{formatAccountInstant(detail.createdAt, locale)}</dd></div>
          <div><dt>{dictionary.adminUsersDirectoryColumnLastActivity}</dt><dd>{detail.lastActivityAt ? formatAccountInstant(detail.lastActivityAt, locale) : dictionary.adminUsersDirectoryLastActivityNever}</dd></div>
        </dl>
      </CardContent>
      <CardFooter>
        <Button asChild data-ds-hit-target variant="outline"><Link href="/admin/accounts">{dictionary.adminUsersDirectoryDetailBack}</Link></Button>
      </CardFooter>
    </Card>
  );
}

// Identity edit posts the expected-version CAS; a stale form or a unique
// collision lands on the one conflict notice.
function IdentityCard({ detail, dictionary }: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.adminUserProfileIdentityHeading}</CardTitle>
        <CardDescription>{dictionary.adminUserProfileIdentityDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={`/admin/users/${detail.id}/identity`} method="post">
          <FieldGroup>
            <Input name="expectedVersion" readOnly type="hidden" value={String(detail.editor.profileVersion)} />
            <Field>
              <FieldLabel htmlFor={`identity-username-${detail.id}`}>{dictionary.usernameLabel}</FieldLabel>
              <Input autoComplete="off" defaultValue={detail.username} id={`identity-username-${detail.id}`} name="username" required />
            </Field>
            <Field>
              <FieldLabel htmlFor={`identity-email-${detail.id}`}>{dictionary.adminEmailLabel}</FieldLabel>
              <Input autoComplete="off" defaultValue={detail.email ?? ""} id={`identity-email-${detail.id}`} name="email" type="email" />
            </Field>
            <AdminSubmit label={dictionary.adminUserProfileIdentitySave} tone="secondary" />
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

// Role, status, and password reset re-house the legacy inline forms on their
// byte-frozen routes; those routes land on the accounts workspace notices.
function AccessCard({ detail, dictionary }: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.adminUserProfileAccessHeading}</CardTitle>
        <CardDescription>{dictionary.adminUserProfileAccessDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
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
          <form action={`/admin/users/${detail.id}/password`} method="post">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`password-${detail.id}`}>{dictionary.passwordLabel}</FieldLabel>
                <Input aria-describedby={`password-help-${detail.id}`} autoComplete="new-password" id={`password-${detail.id}`} minLength={12} name="password" required type="password" />
                <FieldDescription id={`password-help-${detail.id}`}>{dictionary.adminPasswordHelp}</FieldDescription>
              </Field>
              <AdminSubmit label={dictionary.adminChangePassword} tone="secondary" />
            </FieldGroup>
          </form>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function LocaleCard({ detail, dictionary }: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.adminUserProfileLocaleHeading}</CardTitle>
        <CardDescription>{dictionary.adminUserProfileLocaleDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={`/admin/users/${detail.id}/locale`} method="post">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`locale-${detail.id}`}>{dictionary.adminUserProfileLocaleLabel}</FieldLabel>
              <NativeSelect defaultValue={detail.editor.preferredLocale ?? ""} id={`locale-${detail.id}`} name="locale">
                <NativeSelectOption value="">{dictionary.adminUserProfileLocaleClear}</NativeSelectOption>
                <NativeSelectOption value="pt-BR">Português (Brasil)</NativeSelectOption>
                <NativeSelectOption value="en">English</NativeSelectOption>
              </NativeSelect>
            </Field>
            <AdminSubmit label={dictionary.adminUserProfileLocaleSave} tone="secondary" />
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

const CHECKOUT_POLICY_LABELS: Record<string, keyof Dictionary> = {
  NONE: "checkoutPolicyNone",
  NAME_EMAIL: "checkoutPolicyNameEmail",
  EMAIL: "checkoutPolicyEmail",
  NAME_EMAIL_CPF: "checkoutPolicyNameEmailCpf",
  NAME_EMAIL_CPF_ADDRESS: "checkoutPolicyNameEmailCpfAddress",
};

function CheckoutPolicyCard({ detail, dictionary }: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.adminUserProfileCheckoutHeading}</CardTitle>
        <CardDescription>{dictionary.adminUserProfileCheckoutDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={`/admin/users/${detail.id}/checkout-policy`} method="post">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`checkout-policy-${detail.id}`}>{dictionary.checkoutPolicyLabel}</FieldLabel>
              <NativeSelect defaultValue={detail.editor.checkoutDataPolicy} id={`checkout-policy-${detail.id}`} name="policy">
                {CHECKOUT_DATA_POLICIES.map((policy) => (
                  <NativeSelectOption key={policy} value={policy}>{dictionary[CHECKOUT_POLICY_LABELS[policy] ?? "checkoutPolicyNone"]}</NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <AdminSubmit label={dictionary.adminUserProfileCheckoutSave} tone="secondary" />
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

// The administrator storefront correction form edits exactly the nine
// sanctioned fields; the owner-fenced logo media identifier never renders.
function StorefrontCard({
  currencyChoices,
  detail,
  dictionary,
}: Readonly<{ currencyChoices: readonly ExchangeCurrencyChoice[]; detail: AdminUserDetail; dictionary: Dictionary }>) {
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
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.adminUserProfileStorefrontHeading}</CardTitle>
        <CardDescription>{dictionary.adminUserProfileStorefrontDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={`/admin/users/${detail.id}/storefront`} method="post">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`storefront-slug-${detail.id}`}>{dictionary.storefrontSlugLabel}</FieldLabel>
              <Input aria-describedby={`storefront-slug-help-${detail.id}`} defaultValue={detail.storefrontSlug ?? ""} id={`storefront-slug-${detail.id}`} maxLength={63} name="storefrontSlug" />
              <FieldDescription id={`storefront-slug-help-${detail.id}`}>{dictionary.storefrontSlugHelp}</FieldDescription>
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
              <FieldLabel htmlFor={`storefront-accent-${detail.id}`}>{dictionary.storefrontAccentColorLabel}</FieldLabel>
              <Input aria-describedby={`storefront-accent-help-${detail.id}`} defaultValue={editor.storefrontAccentColor ?? ""} id={`storefront-accent-${detail.id}`} maxLength={7} name="storefrontAccentColor" placeholder="#RRGGBB" />
              <FieldDescription id={`storefront-accent-help-${detail.id}`}>{dictionary.storefrontAccentColorHelp}</FieldDescription>
            </Field>
            <Field orientation="horizontal">
              <Checkbox defaultChecked={editor.storefrontEnabled} id={`storefront-enabled-${detail.id}`} name="storefrontEnabled" value="true" />
              <FieldLabel htmlFor={`storefront-enabled-${detail.id}`}>{dictionary.storefrontEnabledLabel}</FieldLabel>
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
            <Field orientation="horizontal">
              <Checkbox defaultChecked={editor.storefrontStandalonePaymentsEnabled} id={`storefront-standalone-${detail.id}`} name="storefrontStandalonePaymentsEnabled" value="true" />
              <FieldLabel htmlFor={`storefront-standalone-${detail.id}`}>{dictionary.storefrontStandalonePaymentsLabel}</FieldLabel>
              <FieldDescription>{dictionary.storefrontStandalonePaymentsHelp}</FieldDescription>
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
            <AdminSubmit label={dictionary.adminUserProfileStorefrontSave} tone="secondary" />
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter>
        {storeUrl !== null
          ? <Button asChild data-ds-hit-target variant="outline"><Link href={storeUrl}>{dictionary.adminUserProfileStoreLink}</Link></Button>
          : <p>{dictionary.adminUserProfileStoreUnavailable}</p>}
      </CardFooter>
    </Card>
  );
}

// The password reset request sends a single-use link to the account's
// contact email; every outcome collapses to one opaque redirect.
function PasswordResetCard({ detail, dictionary }: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.adminUserProfilePasswordResetHeading}</CardTitle>
        <CardDescription>{dictionary.adminUserProfilePasswordResetDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={`/admin/users/${detail.id}/reset-password`} method="post">
          <AdminSubmit label={dictionary.adminUserProfilePasswordResetSend} tone="secondary" />
        </form>
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.adminUserProfileTotpHeading}</CardTitle>
        <CardDescription>{dictionary.adminUserProfileTotpDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-secondary">
          {configured ? dictionary.adminUserProfileTotpConfigured : dictionary.adminUserProfileTotpNotConfigured}
        </p>
        {configured && (
          <details className="mt-4">
            <summary><Button asChild type="button" variant="outline"><span>{dictionary.adminUserProfileTotpDisable}</span></Button></summary>
            <Alert className="mt-4" variant="warning">
              <AlertTitle>{dictionary.adminUserProfileTotpHeading}</AlertTitle>
              <AlertDescription>{dictionary.adminUserProfileTotpDescription}</AlertDescription>
            </Alert>
            <form action={`/admin/users/${detail.id}/totp-disable`} className="mt-4" method="post">
              <Button data-ds-hit-target type="submit" variant="destructive">{dictionary.adminUserProfileTotpDisable}</Button>
            </form>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

// The delivered byte-frozen soft-delete route stays the only destructive
// action; it lands on the accounts workspace notices.
function DeleteCard({ detail, dictionary }: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.adminUserProfileDeleteHeading}</CardTitle>
        <CardDescription>{dictionary.adminUserProfileDeleteDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={`/admin/users/${detail.id}/delete`} method="post">
          <Button data-ds-hit-target type="submit" variant="destructive">{dictionary.adminUsersDirectoryDelete}</Button>
        </form>
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
        <Button asChild data-ds-hit-target variant="outline"><Link href="/admin/accounts">{dictionary.adminUsersDirectoryDetailBack}</Link></Button>
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
      {detail === null ? <AccountUnavailableCard dictionary={dictionary} /> : (
        <>
          <AccountFactsCard detail={detail} dictionary={dictionary} locale={locale} />
          {detail.state !== "deleted" ? (
            <>
              <IdentityCard detail={detail} dictionary={dictionary} />
              <AccessCard detail={detail} dictionary={dictionary} />
              <PasswordResetCard detail={detail} dictionary={dictionary} />
              <TotpRecoveryCard configured={totpConfigured} detail={detail} dictionary={dictionary} />
              <LocaleCard detail={detail} dictionary={dictionary} />
              <CheckoutPolicyCard detail={detail} dictionary={dictionary} />
              <StorefrontCard currencyChoices={currencyChoices} detail={detail} dictionary={dictionary} />
              <DeleteCard detail={detail} dictionary={dictionary} />
            </>
          ) : null}
        </>
      )}
    </>
  );
}
