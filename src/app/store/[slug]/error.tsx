"use client";

import { useEffect, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { en } from "@/i18n/dictionaries/en";
import { ptBR } from "@/i18n/dictionaries/pt-BR";
import type { SupportedLocale } from "@/i18n/locales";

import { CheckoutShell } from "@/app/pay/[identifier]/checkout-shell";

// One opaque localized failure for the sessionless storefront: the route error
// boundary echoes no digest or detail, and the only recovery is a render retry.
export default function PublicStorefrontError({ error, reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const language = useSyncExternalStore(() => () => undefined, () => document.documentElement.lang, () => "pt-BR");
  const dictionary = language === "en" ? en : ptBR;
  const locale: SupportedLocale = language === "en" ? "en" : "pt-BR";

  useEffect(() => {
    console.error("Public storefront failed to render", error.digest ?? "no-digest");
  }, [error.digest]);

  return (
    <CheckoutShell dictionary={dictionary} locale={locale}>
      <EmptyState
        action={
          <Button onClick={reset} type="button">
            {dictionary.storefrontErrorRetry}
          </Button>
        }
        body={dictionary.storefrontErrorDescription}
        illustration="unavailable"
        kind="error"
        title={dictionary.storefrontErrorHeading}
      />
    </CheckoutShell>
  );
}
