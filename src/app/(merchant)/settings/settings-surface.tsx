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
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-[calc(var(--space-12)*4)_1fr] lg:items-start">
        <nav aria-label={dictionary.settingsNavLabel} className="hidden lg:block">
          <div className="flex flex-col gap-1 lg:sticky lg:top-[calc(var(--top-bar-height)+var(--space-6))]">
            {SECTIONS.map(({ id, labelKey }) => (
              <a
                key={id}
                aria-current={activeId === id ? "true" : undefined}
                className="flex min-h-11 items-center rounded-md px-3 text-xs text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground aria-[current=true]:bg-muted aria-[current=true]:font-semibold aria-[current=true]:text-foreground"
                href={`#settings-${id}`}
              >
                {dictionary[labelKey as keyof Dictionary] as string}
              </a>
            ))}
          </div>
        </nav>

        <div className="grid min-w-0 gap-8">
          <section aria-labelledby="settings-connection-heading" className="grid gap-4 scroll-mt-[calc(var(--top-bar-height)+var(--space-6))]" id="settings-connection">
            <h2 className="m-0" id="settings-connection-heading">
              {dictionary.nauttHeading}
            </h2>
            <p className="m-0 max-w-[var(--layout-max)] text-muted-foreground">{dictionary.nauttDescription}</p>
            <NauttCredentialSurface dictionary={dictionary} locale={locale} notice={notices.nautt} status={nauttStatus} />
          </section>

          <section aria-labelledby="settings-policy-heading" className="grid gap-4 scroll-mt-[calc(var(--top-bar-height)+var(--space-6))]" id="settings-policy">
            <h2 className="m-0" id="settings-policy-heading">
              {dictionary.checkoutPolicyHeading}
            </h2>
            <p className="m-0 max-w-[var(--layout-max)] text-muted-foreground">{dictionary.checkoutPolicyDescription}</p>
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

          <section aria-labelledby="settings-language-heading" className="grid gap-4 scroll-mt-[calc(var(--top-bar-height)+var(--space-6))]" id="settings-language">
            <h2 className="m-0" id="settings-language-heading">
              {dictionary.languageHeading}
            </h2>
            <p className="m-0 max-w-[var(--layout-max)] text-muted-foreground">{dictionary.settingsLanguageDescription}</p>
            {notices.language === "saved" ? (
              <noscript>
                <Alert role="status" variant="success">
                  <AlertTitle>{dictionary.languageHeading}</AlertTitle>
                  <AlertDescription>{dictionary.languageSaved}</AlertDescription>
                </Alert>
              </noscript>
            ) : null}
            {notices.language === "error" ? (
              <noscript>
                <Alert variant="destructive">
                  <AlertTitle>{dictionary.languageHeading}</AlertTitle>
                  <AlertDescription>{dictionary.languageError}</AlertDescription>
                </Alert>
              </noscript>
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
