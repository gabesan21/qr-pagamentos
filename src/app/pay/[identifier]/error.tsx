"use client";

import { useSyncExternalStore } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { en } from "@/i18n/dictionaries/en";
import { ptBR } from "@/i18n/dictionaries/pt-BR";
import type { SupportedLocale } from "@/i18n/locales";

import { CheckoutShell } from "./checkout-shell";

export function getCheckoutErrorDictionary(language: string) {
  return language === "en" ? en : ptBR;
}

export default function PublicCheckoutError({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const language = useSyncExternalStore(() => () => undefined, () => document.documentElement.lang, () => "pt-BR");
  const dictionary = getCheckoutErrorDictionary(language);
  const locale: SupportedLocale = language === "en" ? "en" : "pt-BR";

  return (
    <CheckoutShell dictionary={dictionary} locale={locale}>
      <Card className="w-full">
        <CardHeader><CardTitle>{dictionary.checkoutErrorHeading}</CardTitle></CardHeader>
        <CardContent className="grid gap-6">
          <Alert variant="destructive">
            <AlertTitle>{dictionary.checkoutErrorHeading}</AlertTitle>
            <AlertDescription>{dictionary.checkoutErrorDescription}</AlertDescription>
          </Alert>
          <Button onClick={reset} size="lg" type="button">{dictionary.checkoutErrorRetry}</Button>
        </CardContent>
      </Card>
    </CheckoutShell>
  );
}
