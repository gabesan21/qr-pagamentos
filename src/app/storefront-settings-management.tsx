"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import type { StorefrontSettingsData } from "@/auth/storefront-settings";
import { BrandIdentity } from "@/brand/brand-identity";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { DEFAULT_STOREFRONT_THEME_ID, STOREFRONT_THEME_IDS } from "@/design-system/themes";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

import { omitUnchangedExtendedFields, type StorefrontExtendedPrefill } from "./storefront-form-preparation";
import { StorefrontPreview } from "./storefront-preview";

type Dictionary = ReturnType<typeof getDictionary>;

export type StorefrontCurrencyChoice = Readonly<{ code: string; label: string }>;

type StorefrontSettingsManagementProps = Readonly<{
  currencyChoices: readonly StorefrontCurrencyChoice[];
  dictionary: Dictionary;
  locale: SupportedLocale;
  logoNotice?: string;
  settings: StorefrontSettingsData;
  stagedLogoMediaIdentifier: string | null;
}>;

const ACCENT_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const DEFAULT_STOREFRONT_LAYOUT = "boxed";

export function StorefrontSettingsManagement({
  currencyChoices,
  dictionary,
  locale,
  logoNotice,
  settings,
  stagedLogoMediaIdentifier,
}: StorefrontSettingsManagementProps) {
  const formId = "storefront-settings";
  const uploadFormId = "storefront-logo-upload";
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);

  const prefill: StorefrontExtendedPrefill = {
    themeId: settings.storefrontThemeId ?? DEFAULT_STOREFRONT_THEME_ID,
    layout: settings.storefrontLayout ?? DEFAULT_STOREFRONT_LAYOUT,
    standalonePaymentsEnabled: settings.storefrontStandalonePaymentsEnabled ? "true" : "false",
    defaultCurrencyCode: settings.storefrontDefaultCurrencyCode ?? "",
  };

  const [pending, setPending] = useState(false);
  const [uploadPending, setUploadPending] = useState(false);
  const [logo, setLogo] = useState<string | null>(stagedLogoMediaIdentifier ?? settings.storefrontLogoMediaIdentifier);
  const [themeId, setThemeId] = useState(prefill.themeId);
  const [layout, setLayout] = useState(prefill.layout);
  const [accent, setAccent] = useState(settings.storefrontAccentColor ?? "");
  const [displayNamePtBr, setDisplayNamePtBr] = useState(settings.storefrontDisplayNamePtBr ?? "");
  const [displayNameEn, setDisplayNameEn] = useState(settings.storefrontDisplayNameEn ?? "");
  const [standalonePayments, setStandalonePayments] = useState(settings.storefrontStandalonePaymentsEnabled);

  useEffect(() => {
    const fieldset = fieldsetRef.current;
    const form = fieldset?.closest("form");
    const uploadForm = document.getElementById(uploadFormId);
    if (!(form instanceof HTMLFormElement) || !(uploadForm instanceof HTMLFormElement)) return;

    const uploadControls = () => Array.from(uploadForm.elements);
    const disableUploadControls = () => {
      for (const control of uploadControls()) {
        if (control instanceof HTMLInputElement || control instanceof HTMLButtonElement) control.disabled = true;
      }
    };
    const observeSubmit = () => {
      if (pending) return;
      flushSync(() => { setPending(true); });
    };
    const observePayload = (event: FormDataEvent) => {
      omitUnchangedExtendedFields(event.formData, prefill);
      if (fieldset) fieldset.disabled = true;
      disableUploadControls();
    };
    const observeUploadSubmit = () => {
      if (uploadPending) return;
      flushSync(() => { setUploadPending(true); });
    };
    const observeUploadPayload = () => {
      if (fieldset) fieldset.disabled = true;
      disableUploadControls();
    };
    const observeInput = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
      if (target.name === "storefrontThemeId") setThemeId(target.value);
      else if (target.name === "storefrontLayout") setLayout(target.value);
      else if (target.name === "storefrontAccentColor") setAccent(target.value);
      else if (target.name === "storefrontDisplayNamePtBr") setDisplayNamePtBr(target.value);
      else if (target.name === "storefrontDisplayNameEn") setDisplayNameEn(target.value);
    };
    form.addEventListener("submit", observeSubmit);
    form.addEventListener("formdata", observePayload);
    form.addEventListener("input", observeInput);
    form.addEventListener("change", observeInput);
    uploadForm.addEventListener("submit", observeUploadSubmit);
    uploadForm.addEventListener("formdata", observeUploadPayload);
    return () => {
      form.removeEventListener("submit", observeSubmit);
      form.removeEventListener("formdata", observePayload);
      form.removeEventListener("input", observeInput);
      form.removeEventListener("change", observeInput);
      uploadForm.removeEventListener("submit", observeUploadSubmit);
      uploadForm.removeEventListener("formdata", observeUploadPayload);
    };
    // The prefill snapshot and pending flags are submission-time facts; the
    // listeners intentionally bind the values from first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const themeNames: Record<string, string> = {
    "pix-paper": dictionary.storefrontThemePixPaper,
    "cashier-daylight": dictionary.storefrontThemeCashierDaylight,
    "settlement-sand": dictionary.storefrontThemeSettlementSand,
    "midnight-clearing": dictionary.storefrontThemeMidnightClearing,
    "vault-blue": dictionary.storefrontThemeVaultBlue,
    "terminal-amber": dictionary.storefrontThemeTerminalAmber,
  };
  const localizedName = (locale === "pt-BR" ? displayNamePtBr : displayNameEn).trim();
  const previewName = localizedName === "" ? dictionary.storefrontFallbackName : localizedName;
  const previewAccent = ACCENT_COLOR_PATTERN.test(accent) ? accent : null;
  const currencyDisabled = currencyChoices.length === 0;

  return (
    <>
      <form action="/storefront" id={formId} method="post">
        <fieldset aria-busy={pending || undefined} className="storefront-workspace__fieldset" ref={fieldsetRef}>
          <div className="storefront-workspace">
            <section aria-labelledby="settings-identity-heading" className="settings-surface__section" id="settings-identity">
              <h2 className="settings-surface__section-heading" id="settings-identity-heading">{dictionary.storefrontIdentityHeading}</h2>
              <p className="settings-surface__section-description">{dictionary.storefrontIdentityDescription}</p>
              <Card>
                <CardHeader><CardTitle>{dictionary.storefrontIdentityHeading}</CardTitle><CardDescription>{dictionary.storefrontIdentityDescription}</CardDescription></CardHeader>
                <CardContent>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="storefront-slug">{dictionary.storefrontSlugLabel}</FieldLabel>
                      <Input aria-describedby="storefront-slug-help" defaultValue={settings.storefrontSlug ?? ""} id="storefront-slug" maxLength={63} name="storefrontSlug" />
                      <FieldDescription id="storefront-slug-help">{dictionary.storefrontSlugHelp}</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="storefront-display-name-pt-br">{dictionary.storefrontDisplayNamePtBrLabel}</FieldLabel>
                      <Input defaultValue={displayNamePtBr} id="storefront-display-name-pt-br" maxLength={160} name="storefrontDisplayNamePtBr" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="storefront-display-name-en">{dictionary.storefrontDisplayNameEnLabel}</FieldLabel>
                      <Input defaultValue={displayNameEn} id="storefront-display-name-en" maxLength={160} name="storefrontDisplayNameEn" />
                    </Field>
                  </FieldGroup>
                </CardContent>
              </Card>
            </section>
            <section aria-labelledby="settings-store-heading" className="settings-surface__section" id="settings-store">
              <h2 className="settings-surface__section-heading" id="settings-store-heading">{dictionary.storefrontAppearanceHeading}</h2>
              <p className="settings-surface__section-description">{dictionary.storefrontAppearanceDescription}</p>
              <Card>
                <CardHeader><CardTitle>{dictionary.storefrontAppearanceHeading}</CardTitle><CardDescription>{dictionary.storefrontAppearanceDescription}</CardDescription></CardHeader>
                <CardContent>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="storefront-theme">{dictionary.storefrontThemeLabel}</FieldLabel>
                      <NativeSelect aria-describedby="storefront-theme-help" defaultValue={prefill.themeId} id="storefront-theme" name="storefrontThemeId">
                        {STOREFRONT_THEME_IDS.map((id) => <NativeSelectOption key={id} value={id}>{themeNames[id] ?? id}</NativeSelectOption>)}
                      </NativeSelect>
                      <FieldDescription id="storefront-theme-help">{dictionary.storefrontThemeHelp}</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="storefront-layout">{dictionary.storefrontLayoutLabel}</FieldLabel>
                      <NativeSelect defaultValue={prefill.layout} id="storefront-layout" name="storefrontLayout">
                        <NativeSelectOption value="boxed">{dictionary.storefrontLayoutBoxed}</NativeSelectOption>
                        <NativeSelectOption value="table">{dictionary.storefrontLayoutTable}</NativeSelectOption>
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="storefront-accent-color">{dictionary.storefrontAccentColorLabel}</FieldLabel>
                      <Input aria-describedby="storefront-accent-color-help" defaultValue={settings.storefrontAccentColor ?? ""} id="storefront-accent-color" maxLength={7} name="storefrontAccentColor" placeholder="#RRGGBB" />
                      <FieldDescription id="storefront-accent-color-help">{dictionary.storefrontAccentColorHelp}</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="storefront-logo-file">{dictionary.storefrontLogoLabel}</FieldLabel>
                      <div className="storefront-logo-block">
                        {logo
                          ? <img alt={dictionary.storefrontLogoPreviewAlt} className="storefront-logo-current" src={`/media/${logo}`} />
                          : <span aria-label={dictionary.storefrontLogoFallbackAlt} role="img"><BrandIdentity variant="merchant-fallback" /></span>}
                        {stagedLogoMediaIdentifier ? <p className="storefront-logo-staged" role="status">{dictionary.storefrontLogoStaged}</p> : null}
                        {logoNotice === "failed" ? (
                          <Alert variant="destructive"><AlertTitle>{dictionary.adminErrorHeading}</AlertTitle><AlertDescription>{dictionary.storefrontLogoUploadFailed}</AlertDescription></Alert>
                        ) : null}
                        <Input accept="image/jpeg,image/png,image/webp" aria-describedby="storefront-logo-help" form={uploadFormId} id="storefront-logo-file" name="logo" required type="file" />
                        <FieldDescription id="storefront-logo-help">{dictionary.storefrontLogoHelp}</FieldDescription>
                        <div className="storefront-logo-actions">
                          <Button aria-busy={uploadPending || undefined} form={uploadFormId} type="submit" variant="secondary">
                            {uploadPending ? <Spinner data-icon="inline-start" /> : null}{dictionary.storefrontLogoUpload}
                          </Button>
                          {logo ? <Button onClick={() => setLogo(null)} type="button" variant="outline">{dictionary.storefrontLogoRemove}</Button> : null}
                        </div>
                      </div>
                    </Field>
                    <StorefrontPreview
                      accentColor={previewAccent}
                      displayName={previewName}
                      fallbackAlt={dictionary.storefrontLogoFallbackAlt}
                      heading={dictionary.storefrontPreviewHeading}
                      layout={layout}
                      logoAlt={dictionary.storefrontLogoPreviewAlt}
                      logoMediaIdentifier={logo}
                      priceLabel={dictionary.storefrontPriceLabel}
                      productsHeading={dictionary.storefrontProductsHeading}
                      sampleAction={dictionary.storefrontPreviewSampleAction}
                      sampleDescription={dictionary.storefrontPreviewSampleDescription}
                      samplePrice={dictionary.storefrontPreviewSamplePrice}
                      sampleTitle={dictionary.storefrontPreviewSampleTitle}
                      themeId={themeId}
                    />
                  </FieldGroup>
                </CardContent>
              </Card>
            </section>
            <section aria-labelledby="settings-payments-heading" className="settings-surface__section" id="settings-payments">
              <h2 className="settings-surface__section-heading" id="settings-payments-heading">{dictionary.storefrontPaymentsHeading}</h2>
              <p className="settings-surface__section-description">{dictionary.storefrontPaymentsDescription}</p>
              <Card>
                <CardHeader><CardTitle>{dictionary.storefrontPaymentsHeading}</CardTitle><CardDescription>{dictionary.storefrontPaymentsDescription}</CardDescription></CardHeader>
                <CardContent>
                  <FieldGroup>
                    <Field orientation="horizontal">
                      <Checkbox defaultChecked={settings.storefrontEnabled} id="storefront-enabled" name="storefrontEnabled" value="true" />
                      <FieldLabel htmlFor="storefront-enabled">{dictionary.storefrontEnabledLabel}</FieldLabel>
                    </Field>
                    <Field orientation="horizontal">
                      <Checkbox checked={standalonePayments} id="storefront-standalone-payments" onCheckedChange={(checked) => setStandalonePayments(checked === true)} />
                      <FieldLabel htmlFor="storefront-standalone-payments">{dictionary.storefrontStandalonePaymentsLabel}</FieldLabel>
                      <FieldDescription>{dictionary.storefrontStandalonePaymentsHelp}</FieldDescription>
                    </Field>
                    <input name="storefrontStandalonePaymentsEnabled" readOnly type="hidden" value={standalonePayments ? "true" : "false"} />
                  </FieldGroup>
                </CardContent>
              </Card>
            </section>
            <section aria-labelledby="settings-currency-heading" className="settings-surface__section" id="settings-currency">
              <h2 className="settings-surface__section-heading" id="settings-currency-heading">{dictionary.storefrontCurrencyHeading}</h2>
              <p className="settings-surface__section-description">{dictionary.storefrontCurrencyDescription}</p>
              <Card>
                <CardHeader><CardTitle>{dictionary.storefrontCurrencyHeading}</CardTitle><CardDescription>{dictionary.storefrontCurrencyDescription}</CardDescription></CardHeader>
                <CardContent>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="storefront-currency">{dictionary.storefrontCurrencyLabel}</FieldLabel>
                      <NativeSelect aria-describedby="storefront-currency-help" defaultValue={prefill.defaultCurrencyCode} disabled={currencyDisabled} id="storefront-currency" name="storefrontDefaultCurrencyCode">
                        <NativeSelectOption value="">{dictionary.storefrontCurrencyNone}</NativeSelectOption>
                        {currencyChoices.map((choice) => <NativeSelectOption key={choice.code} value={choice.code}>{choice.label} ({choice.code})</NativeSelectOption>)}
                        {currencyDisabled && prefill.defaultCurrencyCode !== "" ? <NativeSelectOption value={prefill.defaultCurrencyCode}>{prefill.defaultCurrencyCode}</NativeSelectOption> : null}
                      </NativeSelect>
                      <FieldDescription id="storefront-currency-help">{currencyDisabled ? dictionary.storefrontCurrencyUnavailable : dictionary.storefrontCurrencyHelp}</FieldDescription>
                    </Field>
                  </FieldGroup>
                </CardContent>
              </Card>
            </section>
            <input name="storefrontLogoMediaIdentifier" readOnly type="hidden" value={logo ?? ""} />
            <div className="storefront-workspace__actions">
              <Button type="submit">{pending ? <Spinner data-icon="inline-start" /> : null}{dictionary.storefrontSave}</Button>
            </div>
          </div>
        </fieldset>
      </form>
      <form action="/storefront/logo" encType="multipart/form-data" id={uploadFormId} method="post" />
    </>
  );
}
