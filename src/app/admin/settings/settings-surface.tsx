import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react";

import { AdminSubmit } from "@/app/admin/admin-submit";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { STOREFRONT_THEME_IDS } from "@/design-system/themes";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

type Dictionary = ReturnType<typeof getDictionary>;
type Settings = Readonly<{ currencies: string[]; paymentMethods: string[] }>;
type CurrencyPair = Readonly<{ id: string; label: string; currencyUuid: string; exchangeCurrencyUuid: string; active: boolean }>;
type PaymentMethod = Readonly<{ id: string; label: string; paymentMethodUuid: string; active: boolean }>;
type ExchangeCurrencyMapping = Readonly<{ code: string; label: string }>;
type Notice = Readonly<{ tone: "success" | "error"; text: string }> | null;

export function AdminSettingsSurface({
  currencyPairs,
  defaultThemeId,
  dictionary,
  locale,
  mappings,
  notice,
  paymentMethods,
  settings,
}: Readonly<{
  currencyPairs: CurrencyPair[];
  defaultThemeId: string;
  dictionary: Dictionary;
  locale: SupportedLocale;
  mappings: ExchangeCurrencyMapping[];
  notice: Notice;
  paymentMethods: PaymentMethod[];
  settings: Settings;
}>) {
  const sections = [
    { href: "#exchange-currencies", label: dictionary.adminExchangeCurrenciesHeading },
    { href: "#currency-pairs", label: dictionary.adminCatalogCurrencyPairsHeading },
    { href: "#payment-methods", label: dictionary.adminCatalogPaymentMethodsHeading },
    { href: "#payment-settings", label: dictionary.adminPaymentSettingsHeading },
    { href: "#appearance", label: dictionary.adminAppearanceHeading },
    { href: "#language", label: dictionary.languageHeading },
  ];
  return (
    <>
      <WorkspaceHeading
        description={dictionary.adminSettingsDescription}
        eyebrow={dictionary.shellAdminEyebrow}
        title={dictionary.shellSettings}
      />
      {notice ? <SettingsNotice dictionary={dictionary} notice={notice} /> : null}
      <nav aria-label={dictionary.adminSettingsSectionsLabel} className="admin-navigation">
        {sections.map((section) => <Button asChild key={section.href} variant="outline"><a href={section.href}>{section.label}</a></Button>)}
      </nav>
      <ExchangeCurrencies dictionary={dictionary} mappings={mappings} />
      <CatalogCurrencyPairs dictionary={dictionary} pairs={currencyPairs} />
      <CatalogPaymentMethods dictionary={dictionary} methods={paymentMethods} />
      <PaymentSettings dictionary={dictionary} settings={settings} />
      <Appearance defaultThemeId={defaultThemeId} dictionary={dictionary} />
      <LanguagePreference dictionary={dictionary} locale={locale} />
    </>
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

function ExchangeCurrencies({ dictionary, mappings }: Readonly<{ dictionary: Dictionary; mappings: ExchangeCurrencyMapping[] }>) {
  return (
    <Card id="exchange-currencies">
      <CardHeader><CardTitle>{dictionary.adminExchangeCurrenciesHeading}</CardTitle><CardDescription>{dictionary.adminExchangeCurrenciesDescription}</CardDescription></CardHeader>
      <CardContent>
        <form action="/admin/exchange-currencies" method="post">
          <FieldGroup>
            <Field><FieldLabel htmlFor="exchange-currency-code">{dictionary.adminExchangeCurrencyCodeLabel}</FieldLabel><Input aria-describedby="exchange-currency-code-help" id="exchange-currency-code" maxLength={3} name="code" required /><FieldDescription id="exchange-currency-code-help">{dictionary.adminExchangeCurrencyCodeHelp}</FieldDescription></Field>
            <Field><FieldLabel htmlFor="exchange-currency-label">{dictionary.adminCatalogLabelLabel}</FieldLabel><Input id="exchange-currency-label" name="label" required /></Field>
            <Field><FieldLabel htmlFor="exchange-currency-uuid">{dictionary.adminCatalogCurrencyUuidLabel}</FieldLabel><Input aria-describedby="exchange-currency-uuid-help" id="exchange-currency-uuid" name="currencyUuid" required /><FieldDescription id="exchange-currency-uuid-help">{dictionary.adminCatalogUuidHelp}</FieldDescription></Field>
            <Field><FieldLabel htmlFor="exchange-currency-exchange-uuid">{dictionary.adminCatalogExchangeCurrencyUuidLabel}</FieldLabel><Input id="exchange-currency-exchange-uuid" name="exchangeCurrencyUuid" required /></Field>
            <AdminSubmit label={dictionary.adminExchangeCurrencyRegister} name="intent" value="register" />
            <Button name="intent" type="submit" value="replace" variant="outline">{dictionary.adminExchangeCurrencyReplace}</Button>
          </FieldGroup>
        </form>
        <Separator />
        {mappings.length === 0 ? <Alert><AlertTitle>{dictionary.adminExchangeCurrencyEmpty}</AlertTitle><AlertDescription>{dictionary.adminExchangeCurrencyEmptyDescription}</AlertDescription></Alert> : (
          <div className="admin-catalog-list" role="list">
            {mappings.map((mapping) => (
              <section key={mapping.code} aria-labelledby={`exchange-currency-${mapping.code}`} className="admin-catalog-item">
                <div className="admin-catalog-item__facts">
                  <h3 id={`exchange-currency-${mapping.code}`}>{mapping.code}</h3>
                  <dl><div><dt>{dictionary.adminCatalogLabelLabel}</dt><dd>{mapping.label}</dd></div></dl>
                </div>
                <form action="/admin/exchange-currencies" method="post">
                  <Input name="code" readOnly type="hidden" value={mapping.code} />
                  <Button name="intent" type="submit" value="deactivate" variant="outline">{dictionary.adminExchangeCurrencyDeactivate}</Button>
                </form>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CatalogCurrencyPairs({ dictionary, pairs }: Readonly<{ dictionary: Dictionary; pairs: CurrencyPair[] }>) {
  return (
    <Card id="currency-pairs">
      <CardHeader><CardTitle>{dictionary.adminCatalogCurrencyPairsHeading}</CardTitle><CardDescription>{dictionary.adminCatalogCurrencyPairsDescription}</CardDescription></CardHeader>
      <CardContent>
        <form action="/admin/catalog/currency-pairs" method="post">
          <FieldGroup>
            <Field><FieldLabel htmlFor="currency-pair-label">{dictionary.adminCatalogLabelLabel}</FieldLabel><Input id="currency-pair-label" name="label" required /></Field>
            <Field><FieldLabel htmlFor="currency-uuid">{dictionary.adminCatalogCurrencyUuidLabel}</FieldLabel><Input aria-describedby="currency-uuid-help" id="currency-uuid" name="currencyUuid" required /><FieldDescription id="currency-uuid-help">{dictionary.adminCatalogUuidHelp}</FieldDescription></Field>
            <Field><FieldLabel htmlFor="exchange-currency-uuid">{dictionary.adminCatalogExchangeCurrencyUuidLabel}</FieldLabel><Input id="exchange-currency-uuid" name="exchangeCurrencyUuid" required /></Field>
            <AdminSubmit label={dictionary.adminCatalogCreateCurrencyPair} />
          </FieldGroup>
        </form>
        <Separator />
        {pairs.length === 0 ? <Alert><AlertTitle>{dictionary.adminCatalogEmptyCurrencyPairs}</AlertTitle><AlertDescription>{dictionary.adminCatalogEmptyDescription}</AlertDescription></Alert> : (
          <div className="admin-catalog-list" role="list">
            {pairs.map((pair) => (
              <section key={pair.id} aria-labelledby={`currency-pair-${pair.id}`} className="admin-catalog-item">
                <div className="admin-catalog-item__facts">
                  <h3 id={`currency-pair-${pair.id}`}>{pair.label}</h3>
                  <dl><div><dt>{dictionary.adminCatalogCurrencyUuidLabel}</dt><dd>{pair.currencyUuid}</dd></div><div><dt>{dictionary.adminCatalogExchangeCurrencyUuidLabel}</dt><dd>{pair.exchangeCurrencyUuid}</dd></div><div><dt>{dictionary.adminCatalogActiveLabel}</dt><dd><Badge variant={pair.active ? "secondary" : "destructive"}>{pair.active ? dictionary.adminActive : dictionary.adminDisabled}</Badge></dd></div></dl>
                </div>
                <form action={`/admin/catalog/currency-pairs/${pair.id}`} method="post">
                  <FieldGroup>
                    <Field><FieldLabel htmlFor={`currency-pair-label-${pair.id}`}>{dictionary.adminCatalogLabelLabel}</FieldLabel><Input defaultValue={pair.label} id={`currency-pair-label-${pair.id}`} name="label" required /></Field>
                    <AdminSubmit label={dictionary.adminCatalogSave} tone="secondary" />
                  </FieldGroup>
                </form>
                <form action={`/admin/catalog/currency-pairs/${pair.id}`} method="post">
                  <Button name="intent" type="submit" value={pair.active ? "toggle-inactive" : "toggle-active"} variant="outline">{pair.active ? dictionary.adminCatalogToggleInactive : dictionary.adminCatalogToggleActive}</Button>
                </form>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CatalogPaymentMethods({ dictionary, methods }: Readonly<{ dictionary: Dictionary; methods: PaymentMethod[] }>) {
  return (
    <Card id="payment-methods">
      <CardHeader><CardTitle>{dictionary.adminCatalogPaymentMethodsHeading}</CardTitle><CardDescription>{dictionary.adminCatalogPaymentMethodsDescription}</CardDescription></CardHeader>
      <CardContent>
        <form action="/admin/catalog/payment-methods" method="post">
          <FieldGroup>
            <Field><FieldLabel htmlFor="payment-method-label">{dictionary.adminCatalogLabelLabel}</FieldLabel><Input id="payment-method-label" name="label" required /></Field>
            <Field><FieldLabel htmlFor="payment-method-uuid">{dictionary.adminCatalogPaymentMethodUuidLabel}</FieldLabel><Input aria-describedby="payment-method-uuid-help" id="payment-method-uuid" name="paymentMethodUuid" required /><FieldDescription id="payment-method-uuid-help">{dictionary.adminCatalogUuidHelp}</FieldDescription></Field>
            <AdminSubmit label={dictionary.adminCatalogCreatePaymentMethod} />
          </FieldGroup>
        </form>
        <Separator />
        {methods.length === 0 ? <Alert><AlertTitle>{dictionary.adminCatalogEmptyPaymentMethods}</AlertTitle><AlertDescription>{dictionary.adminCatalogEmptyDescription}</AlertDescription></Alert> : (
          <div className="admin-catalog-list" role="list">
            {methods.map((method) => (
              <section key={method.id} aria-labelledby={`payment-method-${method.id}`} className="admin-catalog-item">
                <div className="admin-catalog-item__facts">
                  <h3 id={`payment-method-${method.id}`}>{method.label}</h3>
                  <dl><div><dt>{dictionary.adminCatalogPaymentMethodUuidLabel}</dt><dd>{method.paymentMethodUuid}</dd></div><div><dt>{dictionary.adminCatalogActiveLabel}</dt><dd><Badge variant={method.active ? "secondary" : "destructive"}>{method.active ? dictionary.adminActive : dictionary.adminDisabled}</Badge></dd></div></dl>
                </div>
                <form action={`/admin/catalog/payment-methods/${method.id}`} method="post">
                  <FieldGroup>
                    <Field><FieldLabel htmlFor={`payment-method-label-${method.id}`}>{dictionary.adminCatalogLabelLabel}</FieldLabel><Input defaultValue={method.label} id={`payment-method-label-${method.id}`} name="label" required /></Field>
                    <AdminSubmit label={dictionary.adminCatalogSave} tone="secondary" />
                  </FieldGroup>
                </form>
                <form action={`/admin/catalog/payment-methods/${method.id}`} method="post">
                  <Button name="intent" type="submit" value={method.active ? "toggle-inactive" : "toggle-active"} variant="outline">{method.active ? dictionary.adminCatalogToggleInactive : dictionary.adminCatalogToggleActive}</Button>
                </form>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PaymentSettings({ dictionary, settings }: Readonly<{ dictionary: Dictionary; settings: Settings }>) {
  return (
    <Card id="payment-settings">
      <CardHeader><CardTitle>{dictionary.adminPaymentSettingsHeading}</CardTitle><CardDescription>{dictionary.adminPaymentSettingsHelp}</CardDescription></CardHeader>
      <CardContent>
        <form action="/admin/payment-settings" method="post">
          <FieldGroup>
            <FieldSet><FieldLegend>{dictionary.adminCurrenciesLabel}</FieldLegend><Field orientation="horizontal"><Checkbox defaultChecked={settings.currencies.includes("BRL")} id="currency-brl" name="currencies" value="BRL" /><FieldLabel htmlFor="currency-brl">{dictionary.adminCurrencyBRL}</FieldLabel></Field></FieldSet>
            <FieldSet><FieldLegend>{dictionary.adminPaymentMethodsLabel}</FieldLegend><Field orientation="horizontal"><Checkbox defaultChecked={settings.paymentMethods.includes("PIX")} id="payment-pix" name="paymentMethods" value="PIX" /><FieldLabel htmlFor="payment-pix">{dictionary.adminPaymentMethodPIX}</FieldLabel></Field></FieldSet>
            <AdminSubmit label={dictionary.adminSavePaymentSettings} />
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function Appearance({ defaultThemeId, dictionary }: Readonly<{ defaultThemeId: string; dictionary: Dictionary }>) {
  const themeNames: Record<string, string> = {
    "pix-paper": dictionary.storefrontThemePixPaper,
    "cashier-daylight": dictionary.storefrontThemeCashierDaylight,
    "settlement-sand": dictionary.storefrontThemeSettlementSand,
    "midnight-clearing": dictionary.storefrontThemeMidnightClearing,
    "vault-blue": dictionary.storefrontThemeVaultBlue,
    "terminal-amber": dictionary.storefrontThemeTerminalAmber,
  };
  return (
    <Card id="appearance">
      <CardHeader><CardTitle>{dictionary.adminAppearanceHeading}</CardTitle><CardDescription>{dictionary.adminAppearanceDescription}</CardDescription></CardHeader>
      <CardContent>
        <form action="/admin/settings/default-theme" method="post">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="default-theme">{dictionary.adminDefaultThemeLabel}</FieldLabel>
              <NativeSelect aria-describedby="default-theme-help" defaultValue={defaultThemeId} id="default-theme" name="themeId">
                {STOREFRONT_THEME_IDS.map((id) => <NativeSelectOption key={id} value={id}>{themeNames[id] ?? id}</NativeSelectOption>)}
              </NativeSelect>
              <FieldDescription id="default-theme-help">{dictionary.adminDefaultThemeHelp}</FieldDescription>
            </Field>
            <AdminSubmit label={dictionary.adminDefaultThemeSave} />
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function LanguagePreference({ dictionary, locale }: Readonly<{ dictionary: Dictionary; locale: SupportedLocale }>) {
  return (
    <Card id="language">
      <CardHeader><CardTitle>{dictionary.languageHeading}</CardTitle><CardDescription>{dictionary.adminLanguageDescription}</CardDescription></CardHeader>
      <CardContent><form action="/language-preference" method="post"><FieldGroup><Field><FieldLabel htmlFor="admin-locale">{dictionary.languageLabel}</FieldLabel><NativeSelect defaultValue={locale} id="admin-locale" name="locale"><NativeSelectOption value="pt-BR">Português (Brasil)</NativeSelectOption><NativeSelectOption value="en">English</NativeSelectOption></NativeSelect></Field><AdminSubmit label={dictionary.languageSave} tone="secondary" /></FieldGroup></form></CardContent>
    </Card>
  );
}
