"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2Icon } from "lucide-react";

import { AdminSubmit } from "@/app/admin/admin-submit";
import { SegmentedControl } from "@/app/admin/admin-controls";
import type { AdminUserDetail } from "@/auth/admin-user-directory";
import type { ExchangeCurrencyChoice } from "@/auth/supported-exchange-currency";
import { Button } from "@/components/ui/button";
import { DEFAULT_STOREFRONT_THEME_ID, STOREFRONT_THEME_IDS } from "@/design-system/themes";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LocalizedFieldGroup } from "@/components/ui/localized-field-group";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import type { getDictionary } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

type Dictionary = ReturnType<typeof getDictionary>;

const THEME_NAMES: Readonly<Record<string, keyof Dictionary>> = {
  "pix-paper": "storefrontThemePixPaper",
  "cashier-daylight": "storefrontThemeCashierDaylight",
  "settlement-sand": "storefrontThemeSettlementSand",
  "midnight-clearing": "storefrontThemeMidnightClearing",
  "vault-blue": "storefrontThemeVaultBlue",
  "terminal-amber": "storefrontThemeTerminalAmber",
};

// The administrator storefront correction form edits exactly the nine
// sanctioned fields; the owner-fenced logo media identifier never renders.
// `accentField` is composed by the page: its inline custom-property style is
// allow-listed by `scripts/check-design-tokens.mjs` at the page's path only.
export function StorefrontSection({
  accentField,
  currencyChoices,
  detail,
  dictionary,
}: Readonly<{ accentField: ReactNode; currencyChoices: readonly ExchangeCurrencyChoice[]; detail: AdminUserDetail; dictionary: Dictionary }>) {
  const editor = detail.editor;
  const [namePtBr, setNamePtBr] = useState(editor.storefrontDisplayNamePtBr ?? "");
  const [nameEn, setNameEn] = useState(editor.storefrontDisplayNameEn ?? "");
  const [themeId, setThemeId] = useState(editor.storefrontThemeId ?? DEFAULT_STOREFRONT_THEME_ID);
  const [layout, setLayout] = useState(editor.storefrontLayout ?? "boxed");
  const storedCurrencyMissing = editor.storefrontDefaultCurrencyCode !== null
    && !currencyChoices.some((choice) => choice.code === editor.storefrontDefaultCurrencyCode);
  const storeUrl = detail.storefrontSlug !== null && editor.storefrontEnabled ? `/store/${detail.storefrontSlug}` : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{dictionary.adminUserProfileStorefrontDescription}</p>
      <form action={`/admin/users/${detail.id}/storefront`} method="post">
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`storefront-slug-${detail.id}`}>{dictionary.storefrontSlugLabel}</FieldLabel>
            <div className="flex items-center gap-2">
              <span aria-hidden className="text-sm text-muted-foreground">/store/</span>
              <Input
                aria-describedby={`storefront-slug-help-${detail.id}`}
                className="font-mono"
                defaultValue={detail.storefrontSlug ?? ""}
                id={`storefront-slug-${detail.id}`}
                maxLength={63}
                name="storefrontSlug"
              />
            </div>
            <FieldDescription id={`storefront-slug-help-${detail.id}`}>{dictionary.storefrontSlugHelp}</FieldDescription>
          </Field>
          {accentField}
        </FieldGroup>

        <div className="mt-4">
          <LocalizedFieldGroup
            fields={{
              "pt-BR": { label: dictionary.storefrontDisplayNamePtBrLabel, localeLabel: "Português (Brasil)", value: namePtBr },
              en: { label: dictionary.storefrontDisplayNameEnLabel, localeLabel: "English", value: nameEn },
            }}
            groupLabel={dictionary.adminUserProfileStorefrontHeading}
            id={`storefront-names-${detail.id}`}
            onValueChange={(locale, value) => (locale === "pt-BR" ? setNamePtBr(value) : setNameEn(value))}
          />
          {/* LocalizedFieldGroup's inputs are controlled and unnamed; these
              mirror the two values into the storefront form's real fields. */}
          <input name="storefrontDisplayNamePtBr" type="hidden" value={namePtBr} />
          <input name="storefrontDisplayNameEn" type="hidden" value={nameEn} />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>{dictionary.storefrontThemeLabel}</FieldLabel>
            <div aria-label={dictionary.storefrontThemeLabel} className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup">
              {STOREFRONT_THEME_IDS.map((id) => {
                const selected = themeId === id;
                const label = dictionary[THEME_NAMES[id] ?? "storefrontThemePixPaper"] as string;
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
                    <img
                      alt=""
                      className="w-full rounded-md"
                      height={64}
                      src={`/application-assets/theme-swatch-${id}.svg`}
                      width={96}
                    />
                    <span className="mt-1 block text-xs font-medium text-muted-foreground">{label}</span>
                  </button>
                );
              })}
            </div>
            <input name="storefrontThemeId" type="hidden" value={themeId} />
            <FieldDescription>{dictionary.storefrontThemeHelp}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={`storefront-layout-${detail.id}`}>{dictionary.storefrontLayoutLabel}</FieldLabel>
            <SegmentedControl
              ariaLabel={dictionary.storefrontLayoutLabel}
              name="storefrontLayout"
              onChange={setLayout}
              options={[
                { value: "boxed", label: dictionary.storefrontLayoutBoxed },
                { value: "table", label: dictionary.storefrontLayoutTable },
              ]}
              value={layout}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field>
            <FieldLabel htmlFor={`storefront-currency-${detail.id}`}>{dictionary.storefrontCurrencyLabel}</FieldLabel>
            <NativeSelect
              aria-describedby={`storefront-currency-help-${detail.id}`}
              defaultValue={editor.storefrontDefaultCurrencyCode ?? ""}
              id={`storefront-currency-${detail.id}`}
              name="storefrontDefaultCurrencyCode"
            >
              <NativeSelectOption value="">{dictionary.storefrontCurrencyNone}</NativeSelectOption>
              {currencyChoices.map((choice) => (
                <NativeSelectOption key={choice.code} value={choice.code}>{choice.label} ({choice.code})</NativeSelectOption>
              ))}
              {storedCurrencyMissing ? (
                <NativeSelectOption value={editor.storefrontDefaultCurrencyCode as string}>
                  {editor.storefrontDefaultCurrencyCode}
                </NativeSelectOption>
              ) : null}
            </NativeSelect>
            <FieldDescription id={`storefront-currency-help-${detail.id}`}>
              {currencyChoices.length === 0 ? dictionary.storefrontCurrencyUnavailable : dictionary.storefrontCurrencyHelp}
            </FieldDescription>
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-6">
            <Field orientation="horizontal">
              <Switch defaultChecked={editor.storefrontEnabled} id={`storefront-enabled-${detail.id}`} name="storefrontEnabled" value="true" />
              <FieldLabel htmlFor={`storefront-enabled-${detail.id}`}>{dictionary.storefrontEnabledLabel}</FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <Switch
                defaultChecked={editor.storefrontStandalonePaymentsEnabled}
                id={`storefront-standalone-${detail.id}`}
                name="storefrontStandalonePaymentsEnabled"
                value="true"
              />
              <FieldLabel htmlFor={`storefront-standalone-${detail.id}`}>{dictionary.storefrontStandalonePaymentsLabel}</FieldLabel>
            </Field>
          </div>
          <AdminSubmit label={dictionary.adminUserProfileStorefrontSave} tone="secondary" />
        </div>
      </form>
      {storeUrl !== null ? (
        <div className="border-t border-border pt-4">
          <Button asChild data-ds-hit-target variant="outline">
            <Link href={storeUrl}>{dictionary.adminUserProfileStoreLink}</Link>
          </Button>
        </div>
      ) : (
        <p className="border-t border-border pt-4 text-sm text-muted-foreground">{dictionary.adminUserProfileStoreUnavailable}</p>
      )}
    </div>
  );
}
