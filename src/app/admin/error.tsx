"use client";

import { useEffect, useSyncExternalStore } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { en } from "@/i18n/dictionaries/en";
import { ptBR } from "@/i18n/dictionaries/pt-BR";

export function getAdminErrorDictionary(language: string) {
  return language === "en" ? en : ptBR;
}

export default function AdminError({ error, reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const language = useSyncExternalStore(() => () => undefined, () => document.documentElement.lang, () => "pt-BR");
  const dictionary = getAdminErrorDictionary(language);

  useEffect(() => {
    console.error("Protected administrator surface failed to render", error.digest ?? "no-digest");
  }, [error.digest]);

  return (
    <div className="admin-shell">
      <Alert variant="destructive">
        <AlertTitle>{dictionary.adminReadErrorHeading}</AlertTitle>
        <AlertDescription>{dictionary.adminReadErrorDescription}</AlertDescription>
      </Alert>
      <Button onClick={reset} type="button">{dictionary.adminRetry}</Button>
    </div>
  );
}
