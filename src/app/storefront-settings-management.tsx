"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { CheckCircle2Icon } from "lucide-react";

import type { StorefrontSettingsData } from "@/auth/storefront-settings";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ImageUploader, type ImageUploaderLabels, type StagedImage } from "@/components/ui/image-uploader";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/modal";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_STOREFRONT_THEME_ID, STOREFRONT_THEME_IDS } from "@/design-system/themes";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";
import { MAX_MEDIA_BYTES, MEDIA_IDENTIFIER_PATTERN } from "@/media/types";
import { cn } from "@/lib/utils";

import { SegmentedControl } from "./(merchant)/merchant-controls";
import { omitUnchangedExtendedFields, type StorefrontExtendedPrefill } from "./storefront-form-preparation";
import { StorefrontPreview } from "./storefront-preview";

type Dictionary = ReturnType<typeof getDictionary>;

export type StorefrontCurrencyChoice = Readonly<{ code: string; label: string }>;

type StorefrontSettingsManagementProps = Readonly<{
  currencyChoices: readonly StorefrontCurrencyChoice[];
  dictionary: Dictionary;
  locale: SupportedLocale;
  logoNotice?: string;
  notice?: string;
  settings: StorefrontSettingsData;
  stagedLogoMediaIdentifier: string | null;
}>;

const ACCENT_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const DEFAULT_STOREFRONT_LAYOUT = "boxed";
const ACCEPTED_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

// Stages the logo through the unchanged POST /storefront/logo multipart
// endpoint and reads the opaque identifier from the followed 303 target
// (relative-redirect.ts); a failed or unreadable outcome rejects into the
// uploader's failed state and never reaches the media read route directly.
async function stageStorefrontLogo(file: File): Promise<StagedImage> {
  const body = new FormData();
  body.set("logo", file);
  const response = await fetch("/storefront/logo", { method: "POST", body });
  const target = new URL(response.url);
  const identifier = target.searchParams.get("logo");
  if (
    target.searchParams.get("storefront-logo") !== "staged" ||
    typeof identifier !== "string" ||
    !MEDIA_IDENTIFIER_PATTERN.test(identifier)
  ) {
    throw new Error("logo staging unavailable");
  }
  return { identifier, previewUrl: `/media/${identifier}` };
}

export function StorefrontSettingsManagement({
  currencyChoices,
  dictionary,
  locale,
  logoNotice,
  notice,
  settings,
  stagedLogoMediaIdentifier,
}: StorefrontSettingsManagementProps) {
  const formId = "storefront-settings";
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);

  const prefill: StorefrontExtendedPrefill = {
    themeId: settings.storefrontThemeId ?? DEFAULT_STOREFRONT_THEME_ID,
    layout: settings.storefrontLayout ?? DEFAULT_STOREFRONT_LAYOUT,
    standalonePaymentsEnabled: settings.storefrontStandalonePaymentsEnabled ? "true" : "false",
    defaultCurrencyCode: settings.storefrontDefaultCurrencyCode ?? "",
  };

  const [pending, setPending] = useState(false);
  const [logo, setLogo] = useState<string | null>(stagedLogoMediaIdentifier ?? settings.storefrontLogoMediaIdentifier);
  const [themeId, setThemeId] = useState(prefill.themeId);
  const [layout, setLayout] = useState(prefill.layout);
  const [accent, setAccent] = useState(settings.storefrontAccentColor ?? "");
  const [slug, setSlug] = useState(settings.storefrontSlug ?? "");
  const [displayNamePtBr, setDisplayNamePtBr] = useState(settings.storefrontDisplayNamePtBr ?? "");
  const [displayNameEn, setDisplayNameEn] = useState(settings.storefrontDisplayNameEn ?? "");
  const [standalonePayments, setStandalonePayments] = useState(settings.storefrontStandalonePaymentsEnabled);
  const [storefrontEnabled, setStorefrontEnabled] = useState(settings.storefrontEnabled);
  const [pendingEnabled, setPendingEnabled] = useState(settings.storefrontEnabled);
  const [enableGuardMessage, setEnableGuardMessage] = useState<string | null>(null);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [currencyCode, setCurrencyCode] = useState(prefill.defaultCurrencyCode);

  useEffect(() => {
    const fieldset = fieldsetRef.current;
    const form = fieldset?.closest("form");
    if (!(form instanceof HTMLFormElement)) return;

    const observeSubmit = () => {
      if (pending) return;
      flushSync(() => { setPending(true); });
    };
    const observePayload = (event: FormDataEvent) => {
      omitUnchangedExtendedFields(event.formData, prefill);
      if (fieldset) fieldset.disabled = true;
    };
    const observeInput = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
      if (target.name === "storefrontSlug") setSlug(target.value);
      else if (target.name === "storefrontDisplayNamePtBr") setDisplayNamePtBr(target.value);
      else if (target.name === "storefrontDisplayNameEn") setDisplayNameEn(target.value);
    };
    form.addEventListener("submit", observeSubmit);
    form.addEventListener("formdata", observePayload);
    form.addEventListener("input", observeInput);
    form.addEventListener("change", observeInput);
    return () => {
      form.removeEventListener("submit", observeSubmit);
      form.removeEventListener("formdata", observePayload);
      form.removeEventListener("input", observeInput);
      form.removeEventListener("change", observeInput);
    };
    // The prefill snapshot and pending flag are submission-time facts; the
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
  const noticeFailed = notice === "failed" || notice === "conflict";

  const logoLabels: ImageUploaderLabels = {
    selectFile: dictionary.storefrontLogoSelectFile,
    hint: dictionary.storefrontLogoHint,
    replace: dictionary.storefrontLogoReplace,
    remove: dictionary.storefrontLogoRemove,
    retry: dictionary.storefrontLogoRetry,
    staging: dictionary.storefrontLogoStaging,
    staged: dictionary.storefrontLogoStaged,
    removed: dictionary.storefrontLogoRemoved,
    uploadFailed: dictionary.storefrontLogoUploadFailed,
    invalidType: dictionary.storefrontLogoInvalidType,
    tooLarge: dictionary.storefrontLogoTooLarge,
  };

  function requestStorefrontEnabledChange(next: boolean) {
    if (next) {
      const missing: string[] = [];
      if (slug.trim() === "") missing.push(dictionary.storefrontSlugLabel);
      if (displayNamePtBr.trim() === "") missing.push(dictionary.storefrontDisplayNamePtBrLabel);
      if (displayNameEn.trim() === "") missing.push(dictionary.storefrontDisplayNameEnLabel);
      if (missing.length > 0) {
        setEnableGuardMessage(dictionary.storefrontEnableGuardMissing.replace("{items}", missing.join(", ")));
        return;
      }
    }
    setEnableGuardMessage(null);
    setPendingEnabled(next);
    setToggleOpen(true);
  }

  return (
    <form action="/storefront" id={formId} method="post">
      <fieldset aria-busy={pending || undefined} className="contents" ref={fieldsetRef}>
        <div className="space-y-8">
          <section aria-labelledby="settings-identity-heading" className="settings-surface__section" id="settings-identity">
            <h2 className="settings-surface__section-heading" id="settings-identity-heading">{dictionary.storefrontIdentityHeading}</h2>
            <p className="settings-surface__section-description">{dictionary.storefrontIdentityDescription}</p>
            {notice ? (
              <Alert role={noticeFailed ? "alert" : "status"} variant={noticeFailed ? "destructive" : "success"}>
                <AlertTitle>{noticeFailed ? dictionary.adminErrorHeading : dictionary.adminSuccessHeading}</AlertTitle>
                <AlertDescription>{noticeFailed ? dictionary.ownerSettingsFailed : dictionary.ownerSettingsUpdated}</AlertDescription>
              </Alert>
            ) : null}
            <Card>
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
                  {enableGuardMessage ? (
                    <Alert role="alert" variant="destructive">
                      <AlertDescription>{enableGuardMessage}</AlertDescription>
                    </Alert>
                  ) : null}
                  <Field orientation="horizontal">
                    <Switch
                      checked={storefrontEnabled}
                      id="storefront-enabled"
                      onCheckedChange={requestStorefrontEnabledChange}
                    />
                    <FieldLabel htmlFor="storefront-enabled">{dictionary.storefrontEnabledLabel}</FieldLabel>
                  </Field>
                  {storefrontEnabled ? <input name="storefrontEnabled" readOnly type="hidden" value="true" /> : null}
                </FieldGroup>
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="settings-store-heading" className="settings-surface__section" id="settings-store">
            <h2 className="settings-surface__section-heading" id="settings-store-heading">{dictionary.storefrontAppearanceHeading}</h2>
            <p className="settings-surface__section-description">{dictionary.storefrontAppearanceDescription}</p>
            <Card>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel>{dictionary.storefrontThemeLabel}</FieldLabel>
                    <div aria-label={dictionary.storefrontThemeLabel} className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup">
                      {STOREFRONT_THEME_IDS.map((id) => {
                        const selected = themeId === id;
                        return (
                          <button
                            aria-checked={selected}
                            className={cn(
                              "relative rounded-lg border p-1.5 text-left transition-shadow",
                              selected ? "border-primary ring-3 ring-ring" : "border-border hover:border-muted-foreground",
                            )}
                            key={id}
                            onClick={() => setThemeId(id)}
                            role="radio"
                            type="button"
                          >
                            {selected ? <CheckCircle2Icon aria-hidden className="absolute right-2 top-2 size-4 text-primary" /> : null}
                            <img alt="" className="w-full rounded-md" height={64} src={`/application-assets/theme-swatch-${id}.svg`} width={96} />
                            <span className="mt-1 block px-1 text-xs font-medium text-muted-foreground">{themeNames[id] ?? id}</span>
                          </button>
                        );
                      })}
                    </div>
                    <input name="storefrontThemeId" readOnly type="hidden" value={themeId} />
                    <FieldDescription id="storefront-theme-help">{dictionary.storefrontThemeHelp}</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel>{dictionary.storefrontLayoutLabel}</FieldLabel>
                    <SegmentedControl
                      ariaLabel={dictionary.storefrontLayoutLabel}
                      onChange={setLayout}
                      options={[
                        { value: "boxed", label: dictionary.storefrontLayoutBoxed },
                        { value: "table", label: dictionary.storefrontLayoutTable },
                      ]}
                      value={layout}
                    />
                    <input name="storefrontLayout" readOnly type="hidden" value={layout} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="storefront-accent-color">{dictionary.storefrontAccentColorLabel}</FieldLabel>
                    <div className="flex items-center gap-2">
                      {/* Uncontrolled: a native color input only accepts a
                          literal #rrggbb value, so it stays keyed off the
                          validated accent instead of carrying a hardcoded
                          fallback hex outside the token system. Remounting
                          on every valid accent change (`key`) keeps the
                          swatch synced with the paired hex field. */}
                      <input
                        aria-label={dictionary.storefrontAccentColorLabel}
                        className="h-10 w-12 cursor-pointer rounded-md border border-border bg-background p-1"
                        defaultValue={previewAccent ?? undefined}
                        key={previewAccent ?? "unset"}
                        onChange={(event) => setAccent(event.target.value)}
                        type="color"
                      />
                      <Input
                        aria-describedby="storefront-accent-color-help"
                        id="storefront-accent-color"
                        maxLength={7}
                        name="storefrontAccentColor"
                        onChange={(event) => setAccent(event.target.value)}
                        placeholder="#RRGGBB"
                        value={accent}
                      />
                    </div>
                    <FieldDescription id="storefront-accent-color-help">{dictionary.storefrontAccentColorHelp}</FieldDescription>
                  </Field>
                  <Field>
                    {/* ImageUploader exposes no consumer-set id (its picker
                        input carries an internally generated one and is its
                        own accessible label), so this caption stays a plain
                        group label rather than a dangling `htmlFor`. */}
                    <FieldLabel>{dictionary.storefrontLogoLabel}</FieldLabel>
                    <ImageUploader
                      accept={ACCEPTED_LOGO_TYPES}
                      currentPreviewUrl={logo ? `/media/${logo}` : null}
                      labels={logoLabels}
                      maxBytes={MAX_MEDIA_BYTES}
                      onChange={setLogo}
                      stage={stageStorefrontLogo}
                    />
                    {stagedLogoMediaIdentifier ? <p role="status">{dictionary.storefrontLogoStaged}</p> : null}
                    {logoNotice === "failed" ? (
                      <Alert variant="destructive">
                        <AlertTitle>{dictionary.adminErrorHeading}</AlertTitle>
                        <AlertDescription>{dictionary.storefrontLogoUploadFailed}</AlertDescription>
                      </Alert>
                    ) : null}
                    <FieldDescription id="storefront-logo-help">{dictionary.storefrontLogoHelp}</FieldDescription>
                    <noscript>
                      <form action="/storefront/logo" encType="multipart/form-data" method="post">
                        <Input accept="image/jpeg,image/png,image/webp" name="logo" required type="file" />
                        <Button type="submit" variant="secondary">{dictionary.storefrontLogoUpload}</Button>
                      </form>
                    </noscript>
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
              <CardContent>
                <FieldGroup>
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
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="storefront-currency">{dictionary.storefrontCurrencyLabel}</FieldLabel>
                    <div className="flex items-center gap-2">
                      <NativeSelect
                        aria-describedby="storefront-currency-help"
                        className="flex-1"
                        disabled={currencyDisabled}
                        id="storefront-currency"
                        name="storefrontDefaultCurrencyCode"
                        onChange={(event) => setCurrencyCode(event.target.value)}
                        value={currencyCode}
                      >
                        <NativeSelectOption value="">{dictionary.storefrontCurrencyNone}</NativeSelectOption>
                        {currencyChoices.map((choice) => <NativeSelectOption key={choice.code} value={choice.code}>{choice.label} ({choice.code})</NativeSelectOption>)}
                        {currencyDisabled && currencyCode !== "" ? <NativeSelectOption value={currencyCode}>{currencyCode}</NativeSelectOption> : null}
                      </NativeSelect>
                      <Button disabled={currencyCode === ""} onClick={() => setCurrencyCode("")} type="button" variant="outline">
                        {dictionary.storefrontCurrencyClear}
                      </Button>
                    </div>
                    <FieldDescription id="storefront-currency-help">{currencyDisabled ? dictionary.storefrontCurrencyUnavailable : dictionary.storefrontCurrencyHelp}</FieldDescription>
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>
          </section>

          <input name="storefrontLogoMediaIdentifier" readOnly type="hidden" value={logo ?? ""} />
          <div className="flex justify-end">
            <Button type="submit">{pending ? <Spinner data-icon="inline-start" /> : null}{dictionary.storefrontSave}</Button>
          </div>
        </div>
      </fieldset>
      <ConfirmDialog
        cancelLabel={dictionary.cancel}
        confirmLabel={dictionary.storefrontEnabledLabel}
        description={pendingEnabled ? dictionary.storefrontEnableConfirmEnableBody : dictionary.storefrontEnableConfirmDisableBody}
        destructive={!pendingEnabled}
        failureMessage={dictionary.storefrontEnableConfirmFailed}
        onConfirm={() => setStorefrontEnabled(pendingEnabled)}
        onOpenChange={setToggleOpen}
        open={toggleOpen}
        pendingLabel={dictionary.loading}
        title={dictionary.storefrontEnableConfirmTitle}
      />
    </form>
  );
}
