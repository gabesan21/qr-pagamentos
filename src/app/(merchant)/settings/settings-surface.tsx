"use client";

import { useEffect, useState } from "react";

import type { CheckoutDataPolicy } from "@/auth/checkout-policy";
import type { StorefrontSettingsData } from "@/auth/storefront-settings";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";
import type { OwnerNauttStatus } from "@/integrations/nautt/owner-onboarding";

import { CheckoutPolicyManagement } from "@/app/checkout-policy-management";
import { LanguagePreferenceSubmit } from "@/app/language-preference/language-preference-form";
import { NauttCredentialSurface } from "@/app/nautt-credential-surface";
import { StorefrontSettingsManagement, type StorefrontCurrencyChoice } from "@/app/storefront-settings-management";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

type Dictionary = ReturnType<typeof getDictionary>;

type SettingsNotices = Readonly<{
  "checkout-policy"?: string;
  language?: string;
  logo?: string;
  nautt?: string;
  storefront?: string;
  "storefront-logo"?: string;
}>;

const SECTIONS = [
  { id: "connection", labelKey: "settingsNavConnection" },
  { id: "policy", labelKey: "settingsNavPolicy" },
  { id: "identity", labelKey: "settingsNavIdentity" },
  { id: "store", labelKey: "settingsNavStore" },
  { id: "payments", labelKey: "settingsNavPayments" },
  { id: "currency", labelKey: "settingsNavCurrency" },
  { id: "language", labelKey: "settingsNavLanguage" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function SettingsSurface({
  checkoutPolicy,
  currencyChoices,
  dictionary,
  locale,
  nauttStatus,
  notices,
  storefrontSettings,
  stagedLogoMediaIdentifier,
}: Readonly<{
  checkoutPolicy: CheckoutDataPolicy;
  currencyChoices: readonly StorefrontCurrencyChoice[];
  dictionary: Dictionary;
  locale: SupportedLocale;
  nauttStatus: OwnerNauttStatus;
  notices: SettingsNotices;
  storefrontSettings: StorefrontSettingsData;
  stagedLogoMediaIdentifier: string | null;
}>) {
  const [activeId, setActiveId] = useState<SectionId>(SECTIONS[0].id);

  useEffect(() => {
    const elements = SECTIONS.map(({ id }) => document.getElementById(`settings-${id}`)).filter(
      (element): element is HTMLElement => element !== null,
    );
    if (elements.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id.replace("settings-", "") as SectionId);
        }
      },
      { rootMargin: "-30% 0% -60% 0%" },
    );
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const checkoutPolicyFailed = notices["checkout-policy"] === "failed";

  return (
    <div className="settings-surface">
      {notices.nautt ? <NauttNotice code={notices.nautt} dictionary={dictionary} /> : null}

      <div className="settings-surface__layout">
        <nav aria-label={dictionary.settingsNavLabel} className="settings-surface__nav">
          <div className="settings-surface__nav-inner">
            {SECTIONS.map(({ id, labelKey }) => (
              <a
                key={id}
                aria-current={activeId === id ? "true" : undefined}
                className="settings-surface__nav-link"
                href={`#settings-${id}`}
              >
                {dictionary[labelKey as keyof Dictionary] as string}
              </a>
            ))}
          </div>
        </nav>

        <div className="settings-surface__sections">
          <section aria-labelledby="settings-connection-heading" className="settings-surface__section" id="settings-connection">
            <h2 className="settings-surface__section-heading" id="settings-connection-heading">
              {dictionary.nauttHeading}
            </h2>
            <p className="settings-surface__section-description">{dictionary.nauttDescription}</p>
            <NauttCredentialSurface dictionary={dictionary} notice={notices.nautt} status={nauttStatus} />
          </section>

          <section aria-labelledby="settings-policy-heading" className="settings-surface__section" id="settings-policy">
            <h2 className="settings-surface__section-heading" id="settings-policy-heading">
              {dictionary.checkoutPolicyHeading}
            </h2>
            <p className="settings-surface__section-description">{dictionary.checkoutPolicyDescription}</p>
            {notices["checkout-policy"] ? (
              <Alert role={checkoutPolicyFailed ? "alert" : "status"} variant={checkoutPolicyFailed ? "destructive" : "success"}>
                <AlertTitle>{checkoutPolicyFailed ? dictionary.adminErrorHeading : dictionary.adminSuccessHeading}</AlertTitle>
                <AlertDescription>{checkoutPolicyFailed ? dictionary.ownerSettingsFailed : dictionary.ownerSettingsUpdated}</AlertDescription>
              </Alert>
            ) : null}
            <CheckoutPolicyManagement dictionary={dictionary} policy={checkoutPolicy} />
          </section>

          <StorefrontSettingsManagement
            currencyChoices={currencyChoices}
            dictionary={dictionary}
            locale={locale}
            logoNotice={notices["storefront-logo"]}
            notice={notices.storefront}
            settings={storefrontSettings}
            stagedLogoMediaIdentifier={stagedLogoMediaIdentifier}
          />

          <section aria-labelledby="settings-language-heading" className="settings-surface__section" id="settings-language">
            <h2 className="settings-surface__section-heading" id="settings-language-heading">
              {dictionary.languageHeading}
            </h2>
            <p className="settings-surface__section-description">{dictionary.settingsLanguageDescription}</p>
            {notices.language === "saved" ? (
              <Alert role="status" variant="success">
                <AlertTitle>{dictionary.languageHeading}</AlertTitle>
                <AlertDescription>{dictionary.languageSaved}</AlertDescription>
              </Alert>
            ) : null}
            {notices.language === "error" ? (
              <Alert variant="destructive">
                <AlertTitle>{dictionary.languageHeading}</AlertTitle>
                <AlertDescription>{dictionary.languageError}</AlertDescription>
              </Alert>
            ) : null}
            <Card>
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
          </section>
        </div>
      </div>
    </div>
  );
}

function NauttNotice({ code, dictionary }: Readonly<{ code: string; dictionary: Dictionary }>) {
  const copy =
    code === "configured"
      ? dictionary.nauttConfigured
      : code === "invalid"
        ? dictionary.nauttInvalid
        : code === "changed"
          ? dictionary.nauttChanged
          : code === "recovery"
            ? dictionary.nauttRecoveryRequired
            : code === "reset"
              ? dictionary.nauttResetDone
              : code === "unavailable"
                ? dictionary.nauttUnavailable
                : null;
  if (!copy) return null;
  const success = code === "configured" || code === "reset";
  return (
    <Alert role={success ? "status" : "alert"} variant={success ? "success" : "destructive"}>
      <AlertTitle>{dictionary.nauttHeading}</AlertTitle>
      <AlertDescription>{copy}</AlertDescription>
    </Alert>
  );
}
