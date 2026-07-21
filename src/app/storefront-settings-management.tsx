"use client";

import { useEffect, useState } from "react";

import type { StorefrontSettingsData } from "@/auth/storefront-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { getDictionary } from "@/i18n/dictionaries";

type Dictionary = ReturnType<typeof getDictionary>;

export function StorefrontSettingsManagement({ dictionary, settings }: Readonly<{ dictionary: Dictionary; settings: StorefrontSettingsData }>) {
  const formId = "storefront-settings";
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    const submit = () => setPending(true);
    form.addEventListener("submit", submit);
    return () => form.removeEventListener("submit", submit);
  }, []);
  return (
    <Card>
      <CardHeader><CardTitle>{dictionary.storefrontHeading}</CardTitle><CardDescription>{dictionary.storefrontDescription}</CardDescription></CardHeader>
      <CardContent>
        <form action="/storefront" id={formId} method="post">
          <FieldGroup>
            <Field data-disabled={pending || undefined}>
              <FieldLabel htmlFor="storefront-slug">{dictionary.storefrontSlugLabel}</FieldLabel>
              <Input aria-describedby="storefront-slug-help" defaultValue={settings.storefrontSlug ?? ""} disabled={pending} id="storefront-slug" maxLength={63} name="storefrontSlug" />
              <FieldDescription id="storefront-slug-help">{dictionary.storefrontSlugHelp}</FieldDescription>
            </Field>
            <Field data-disabled={pending || undefined}>
              <FieldLabel htmlFor="storefront-display-name-pt-br">{dictionary.storefrontDisplayNamePtBrLabel}</FieldLabel>
              <Input defaultValue={settings.storefrontDisplayNamePtBr ?? ""} disabled={pending} id="storefront-display-name-pt-br" maxLength={160} name="storefrontDisplayNamePtBr" />
            </Field>
            <Field data-disabled={pending || undefined}>
              <FieldLabel htmlFor="storefront-display-name-en">{dictionary.storefrontDisplayNameEnLabel}</FieldLabel>
              <Input defaultValue={settings.storefrontDisplayNameEn ?? ""} disabled={pending} id="storefront-display-name-en" maxLength={160} name="storefrontDisplayNameEn" />
            </Field>
            <Field data-disabled={pending || undefined}>
              <FieldLabel htmlFor="storefront-accent-color">{dictionary.storefrontAccentColorLabel}</FieldLabel>
              <Input aria-describedby="storefront-accent-color-help" defaultValue={settings.storefrontAccentColor ?? ""} disabled={pending} id="storefront-accent-color" maxLength={7} name="storefrontAccentColor" placeholder="#RRGGBB" />
              <FieldDescription id="storefront-accent-color-help">{dictionary.storefrontAccentColorHelp}</FieldDescription>
            </Field>
            <Field data-disabled={pending || undefined} orientation="horizontal">
              <Checkbox defaultChecked={settings.storefrontEnabled} disabled={pending} id="storefront-enabled" name="storefrontEnabled" value="true" />
              <FieldLabel htmlFor="storefront-enabled">{dictionary.storefrontEnabledLabel}</FieldLabel>
            </Field>
            <Button aria-busy={pending || undefined} disabled={pending} form={formId} type="submit">{pending ? <Spinner data-icon="inline-start" /> : null}{dictionary.storefrontSave}</Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
