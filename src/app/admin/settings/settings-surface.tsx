import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { STOREFRONT_THEME_IDS } from "@/design-system/themes";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

import { AppearanceSection } from "./appearance-section";
import { ExchangeCurrenciesSection } from "./exchange-currencies-section";
import { LanguageSection } from "./language-section";
import { PaymentMethodsSection } from "./payment-methods-section";
import { SettingsNav } from "./settings-nav";
import type { SectionNotice } from "./settings-section-notice";

export type Dictionary = ReturnType<typeof getDictionary>;
export type Settings = Readonly<{ currencies: string[]; paymentMethods: string[] }>;
export type CurrencyPair = Readonly<{ id: string; label: string; currencyUuid: string; exchangeCurrencyUuid: string; currencyCode?: string; isDefault?: boolean; active: boolean; createdAt: string }>;
// 13.4.1 F02: read-only probe evidence next to each mapping — never an
// action, never an admin-triggered provider call.
export type ExchangeCurrencyEvidence = Readonly<{
  checkedAt: string | null;
  outcome: string | null;
  observedPaymentMethod: string | null;
  observedCurrencySymbol: string | null;
}>;
export type ExchangeCurrencyMapping = Readonly<{ code: string; label: string; evidence: ExchangeCurrencyEvidence }>;
export type Notice = Readonly<{ tone: "success" | "error"; text: string }> | null;

const SECTION_IDS = [
  "currencies",
  "methods",
  "appearance",
  "language",
] as const;

type SectionId = (typeof SECTION_IDS)[number];

export function AdminSettingsSurface({
  currencyPairs,
  defaultThemeId,
  dictionary,
  exchangeCurrencyNotice,
  languageNotice,
  locale,
  mappings,
  notice,
  paymentSettingsNotice,
  settings,
  themeNotice,
}: Readonly<{
  currencyPairs: CurrencyPair[];
  defaultThemeId: string;
  dictionary: Dictionary;
  exchangeCurrencyNotice: SectionNotice;
  languageNotice: SectionNotice;
  locale: SupportedLocale;
  mappings: ExchangeCurrencyMapping[];
  notice: Notice;
  paymentSettingsNotice: SectionNotice;
  settings: Settings;
  themeNotice: SectionNotice;
}>) {
  const sectionLabels: Record<SectionId, string> = {
    currencies: dictionary.adminSecCurrencies,
    methods: dictionary.adminSecMethods,
    appearance: dictionary.adminAppearanceHeading,
    language: dictionary.languageHeading,
  };

  return (
    <div className="space-y-6">
      <WorkspaceHeading
        className="!border-b-0 !pb-0"
        description={dictionary.adminSettingsDescription}
        eyebrow={dictionary.shellAdminEyebrow}
        title={dictionary.adminSettingsTitle}
      />
      {notice ? <SettingsNotice dictionary={dictionary} notice={notice} /> : null}
      <div className="flex gap-6">
        <SettingsNav
          ariaLabel={dictionary.adminSettingsSectionsLabel}
          sections={SECTION_IDS.map((id) => ({ id, label: sectionLabels[id] }))}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <SectionCard id="sec-currencies" title={dictionary.adminSecCurrencies} description={dictionary.adminSecCurrenciesDesc}>
            <ExchangeCurrenciesSection dictionary={dictionary} mappings={mappings} notice={exchangeCurrencyNotice} />
          </SectionCard>
          <SectionCard id="sec-methods" title={dictionary.adminSecMethods} description={dictionary.adminSecMethodsDesc}>
            <PaymentMethodsSection dictionary={dictionary} mappings={mappings} methods={currencyPairs} notice={paymentSettingsNotice} settings={settings} />
          </SectionCard>
          <SectionCard id="sec-appearance" title={dictionary.adminAppearanceHeading} description={dictionary.adminAppearanceDescription}>
            <AppearanceSection defaultThemeId={defaultThemeId} dictionary={dictionary} notice={themeNotice} themeIds={STOREFRONT_THEME_IDS} />
          </SectionCard>
          <SectionCard id="sec-language" title={dictionary.languageHeading} description={dictionary.adminLanguageDescription}>
            <LanguageSection dictionary={dictionary} locale={locale} notice={languageNotice} />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  children,
  description,
  id,
  title,
}: Readonly<{ children: React.ReactNode; description: string; id: string; title: string }>) {
  return (
    <Card className="scroll-mt-20" id={id}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function SettingsNotice({ dictionary, notice }: Readonly<{ dictionary: Dictionary; notice: Exclude<Notice, null> }>) {
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
