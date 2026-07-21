import Link from "next/link";
import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react";

import { AccountMutationForm } from "@/app/admin/account-mutation-form";
import { AdminSubmit } from "@/app/admin/admin-submit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

type Dictionary = ReturnType<typeof getDictionary>;
type AdminUser = Readonly<{ id: string; username: string; email: string | null; role: "ADMIN" | "USER"; status: "ACTIVE" | "DISABLED" }>;
type Settings = Readonly<{ currencies: string[]; paymentMethods: string[] }>;
type CurrencyPair = Readonly<{ id: string; label: string; currencyUuid: string; exchangeCurrencyUuid: string; active: boolean }>;
type PaymentMethod = Readonly<{ id: string; label: string; paymentMethodUuid: string; active: boolean }>;
type Notice = Readonly<{ tone: "success" | "error"; text: string }> | null;

export function AdminSurface({ actorUsername, currencyPairs, dictionary, locale, notice, paymentMethods, settings, users }: Readonly<{ actorUsername: string; currencyPairs: CurrencyPair[]; dictionary: Dictionary; locale: SupportedLocale; notice: Notice; paymentMethods: PaymentMethod[]; settings: Settings; users: AdminUser[] }>) {
  return (
    <main className="admin-shell">
      <header className="receipt-rail">
        <span className="receipt-rail__label">QR Pagamentos / admin</span>
        <h1>{dictionary.adminHeading}</h1>
        <div className="receipt-rail__facts">
          <span>{actorUsername}</span>
          <Badge variant="outline">{dictionary.adminAdministrator}</Badge>
          <Badge variant="secondary">{locale}</Badge>
        </div>
        <nav aria-label={dictionary.adminNavigationLabel} className="admin-navigation">
          <Button asChild variant="outline"><Link href="/">{dictionary.adminHome}</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/orders">{dictionary.ordersHeading}</Link></Button>
          <form action="/logout" method="post"><AdminSubmit label={dictionary.signOut} tone="secondary" /></form>
        </nav>
      </header>
      <p className="admin-shell__intro">{dictionary.adminIntroduction}</p>
      {notice ? <AdminNotice dictionary={dictionary} notice={notice} /> : null}
      <CreateAccount dictionary={dictionary} />
      <Accounts dictionary={dictionary} users={users} />
      <PaymentSettings dictionary={dictionary} settings={settings} />
      <CatalogCurrencyPairs dictionary={dictionary} pairs={currencyPairs} />
      <CatalogPaymentMethods dictionary={dictionary} methods={paymentMethods} />
      <LanguagePreference dictionary={dictionary} locale={locale} />
    </main>
  );
}

function AdminNotice({ dictionary, notice }: Readonly<{ dictionary: Dictionary; notice: Exclude<Notice, null> }>) {
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

function CreateAccount({ dictionary }: Readonly<{ dictionary: Dictionary }>) {
  return (
    <Card>
      <CardHeader><CardTitle>{dictionary.adminCreateHeading}</CardTitle><CardDescription>{dictionary.adminCreateDescription}</CardDescription></CardHeader>
      <CardContent>
        <form action="/admin/users" method="post">
          <FieldGroup>
            <Field><FieldLabel htmlFor="username">{dictionary.usernameLabel}</FieldLabel><Input autoComplete="username" id="username" name="username" required /></Field>
            <Field><FieldLabel htmlFor="email">{dictionary.adminEmailLabel}</FieldLabel><Input autoComplete="email" id="email" name="email" type="email" /></Field>
            <Field><FieldLabel htmlFor="password">{dictionary.passwordLabel}</FieldLabel><Input aria-describedby="password-help" autoComplete="new-password" id="password" minLength={12} name="password" required type="password" /><FieldDescription id="password-help">{dictionary.adminPasswordHelp}</FieldDescription></Field>
            <Field><FieldLabel htmlFor="role">{dictionary.adminRoleLabel}</FieldLabel><NativeSelect defaultValue="USER" id="role" name="role"><NativeSelectOption value="USER">{dictionary.adminUser}</NativeSelectOption><NativeSelectOption value="ADMIN">{dictionary.adminAdministrator}</NativeSelectOption></NativeSelect></Field>
            <AdminSubmit label={dictionary.adminCreate} />
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function Accounts({ dictionary, users }: Readonly<{ dictionary: Dictionary; users: AdminUser[] }>) {
  return (
    <Card>
      <CardHeader><CardTitle>{dictionary.adminUsersHeading}</CardTitle><CardDescription>{dictionary.adminUsersDescription}</CardDescription></CardHeader>
      <CardContent>
        {users.length === 0 ? <Alert><AlertTitle>{dictionary.adminEmpty}</AlertTitle><AlertDescription>{dictionary.adminEmptyDescription}</AlertDescription></Alert> : (
          <div className="admin-account-list">
            {users.map((user) => <Account dictionary={dictionary} key={user.id} user={user} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Account({ dictionary, user }: Readonly<{ dictionary: Dictionary; user: AdminUser }>) {
  return (
    <section aria-labelledby={`account-${user.id}`} className="admin-account">
      <div className="admin-account__facts">
        <h3 id={`account-${user.id}`}>{user.username}</h3>
        <dl><div><dt>{dictionary.adminEmail}</dt><dd>{user.email ?? dictionary.adminNotProvided}</dd></div><div><dt>{dictionary.adminRole}</dt><dd><Badge variant="outline">{user.role === "ADMIN" ? dictionary.adminAdministrator : dictionary.adminUser}</Badge></dd></div><div><dt>{dictionary.adminStatus}</dt><dd><Badge variant={user.status === "ACTIVE" ? "secondary" : "destructive"}>{user.status === "ACTIVE" ? dictionary.adminActive : dictionary.adminDisabled}</Badge></dd></div></dl>
      </div>
      <Separator />
      <div className="admin-account__actions">
        <AccountMutationForm action={`/admin/users/${user.id}/role`} cancelLabel={dictionary.adminCancel} confirmDescription={dictionary.adminDemotionDescription} confirmLabel={dictionary.adminConfirmDemotion} confirmTitle={dictionary.adminDemotionTitle} currentValue={user.role} destructiveValue="USER" fieldLabel={dictionary.adminRoleLabel} name="role" options={[{ value: "USER", label: dictionary.adminUser }, { value: "ADMIN", label: dictionary.adminAdministrator }]} saveLabel={dictionary.adminSaveRole} />
        <AccountMutationForm action={`/admin/users/${user.id}/status`} cancelLabel={dictionary.adminCancel} confirmDescription={dictionary.adminDisableDescription} confirmLabel={dictionary.adminConfirmDisable} confirmTitle={dictionary.adminDisableTitle} currentValue={user.status} destructiveValue="DISABLED" fieldLabel={dictionary.adminStatusLabel} name="status" options={[{ value: "ACTIVE", label: dictionary.adminActive }, { value: "DISABLED", label: dictionary.adminDisabled }]} saveLabel={dictionary.adminSaveStatus} />
        <form action={`/admin/users/${user.id}/password`} method="post"><FieldGroup><Field><FieldLabel htmlFor={`password-${user.id}`}>{dictionary.passwordLabel}</FieldLabel><Input autoComplete="new-password" id={`password-${user.id}`} minLength={12} name="password" required type="password" /></Field><AdminSubmit label={dictionary.adminChangePassword} tone="secondary" /></FieldGroup></form>
      </div>
    </section>
  );
}

function PaymentSettings({ dictionary, settings }: Readonly<{ dictionary: Dictionary; settings: Settings }>) {
  return (
    <Card>
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

function CatalogCurrencyPairs({ dictionary, pairs }: Readonly<{ dictionary: Dictionary; pairs: CurrencyPair[] }>) {
  return (
    <Card>
      <CardHeader><CardTitle>{dictionary.adminCatalogCurrencyPairsHeading}</CardTitle><CardDescription>{dictionary.adminCatalogDescription}</CardDescription></CardHeader>
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
    <Card>
      <CardHeader><CardTitle>{dictionary.adminCatalogPaymentMethodsHeading}</CardTitle><CardDescription>{dictionary.adminCatalogDescription}</CardDescription></CardHeader>
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

function LanguagePreference({ dictionary, locale }: Readonly<{ dictionary: Dictionary; locale: SupportedLocale }>) {
  return (
    <Card>
      <CardHeader><CardTitle>{dictionary.languageHeading}</CardTitle><CardDescription>{dictionary.adminLanguageDescription}</CardDescription></CardHeader>
      <CardContent><form action="/language-preference" method="post"><FieldGroup><Field><FieldLabel htmlFor="admin-locale">{dictionary.languageLabel}</FieldLabel><NativeSelect defaultValue={locale} id="admin-locale" name="locale"><NativeSelectOption value="pt-BR">Português (Brasil)</NativeSelectOption><NativeSelectOption value="en">English</NativeSelectOption></NativeSelect></Field><AdminSubmit label={dictionary.languageSave} tone="secondary" /></FieldGroup></form></CardContent>
    </Card>
  );
}
