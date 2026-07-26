"use client";

import { useSyncExternalStore } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { en } from "@/i18n/dictionaries/en";
import { ptBR } from "@/i18n/dictionaries/pt-BR";

export function getCheckoutErrorDictionary(language: string) {
  return language === "en" ? en : ptBR;
}

export default function PublicCheckoutError({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const language = useSyncExternalStore(() => () => undefined, () => document.documentElement.lang, () => "pt-BR");
  const dictionary = getCheckoutErrorDictionary(language);

  return (
    <main className="checkout-shell">
      <Card className="checkout-card">
        <CardHeader><CardTitle>{dictionary.checkoutErrorHeading}</CardTitle></CardHeader>
        <CardContent className="checkout-form">
          <Alert variant="destructive">
            <AlertTitle>{dictionary.checkoutErrorHeading}</AlertTitle>
            <AlertDescription>{dictionary.checkoutErrorDescription}</AlertDescription>
          </Alert>
          <Button onClick={reset} type="button">{dictionary.checkoutErrorRetry}</Button>
        </CardContent>
      </Card>
    </main>
  );
}
