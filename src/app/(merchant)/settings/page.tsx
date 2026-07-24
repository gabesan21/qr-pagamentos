import { CheckoutPolicyManagement } from "@/app/checkout-policy-management";
import { LanguagePreferenceSubmit } from "@/app/language-preference/language-preference-form";
import { NauttCredentialSurface } from "@/app/nautt-credential-surface";
import { StorefrontSettingsManagement } from "@/app/storefront-settings-management";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getCheckoutPolicyService } from "@/auth/checkout-policy";
import { getStorefrontSettingsService } from "@/auth/storefront-settings";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { getOwnerOnboardingService } from "@/integrations/nautt/owner-onboarding";

import { requireMerchantShellContext } from "../shell-context";

type SettingsNotices = Readonly<{
  "checkout-policy"?: string;
  language?: string;
  nautt?: string;
  storefront?: string;
}>;

export default async function MerchantSettingsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<SettingsNotices> }>) {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const [nauttStatus, checkoutPolicy, storefrontSettings, notices] = await Promise.all([
    getOwnerOnboardingService().readStatus(principal),
    getCheckoutPolicyService().getForOwner(principal),
    getStorefrontSettingsService().getForOwner(principal),
    searchParams,
  ]);
  const ownerNotice = notices["checkout-policy"] ?? notices.storefront;
  const failed = ownerNotice === "failed" || ownerNotice === "conflict";

  return (
    <>
      <WorkspaceHeading description={dictionary.adminLanguageDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.shellSettings} />
      <NauttCredentialSurface dictionary={dictionary} notice={notices.nautt} status={nauttStatus} />
      {ownerNotice ? (
        <Alert role={failed ? "alert" : "status"} variant={failed ? "destructive" : "success"}>
          <AlertTitle>{failed ? dictionary.adminErrorHeading : dictionary.adminSuccessHeading}</AlertTitle>
          <AlertDescription>{failed ? dictionary.ownerSettingsFailed : dictionary.ownerSettingsUpdated}</AlertDescription>
        </Alert>
      ) : null}
      <CheckoutPolicyManagement dictionary={dictionary} policy={checkoutPolicy.checkoutDataPolicy} />
      <StorefrontSettingsManagement dictionary={dictionary} settings={storefrontSettings} />
      {notices.language === "saved" ? <Alert role="status" variant="success"><AlertTitle>{dictionary.languageHeading}</AlertTitle><AlertDescription>{dictionary.languageSaved}</AlertDescription></Alert> : null}
      {notices.language === "error" ? <Alert variant="destructive"><AlertTitle>{dictionary.languageHeading}</AlertTitle><AlertDescription>{dictionary.languageError}</AlertDescription></Alert> : null}
      <Card>
        <CardHeader><CardTitle>{dictionary.languageHeading}</CardTitle><CardDescription>{dictionary.adminLanguageDescription}</CardDescription></CardHeader>
        <CardContent>
          <form action="/language-preference" method="post">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="merchant-locale">{dictionary.languageLabel}</FieldLabel>
                <NativeSelect defaultValue={locale} id="merchant-locale" name="locale">
                  <NativeSelectOption value="pt-BR">Português (Brasil)</NativeSelectOption>
                  <NativeSelectOption value="en">English</NativeSelectOption>
                </NativeSelect>
              </Field>
              <LanguagePreferenceSubmit label={dictionary.languageSave} />
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
