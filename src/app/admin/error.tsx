"use client";

import { useEffect, useSyncExternalStore } from "react";
import { AlertCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { en } from "@/i18n/dictionaries/en";
import { ptBR } from "@/i18n/dictionaries/pt-BR";

export function getAdminErrorDictionary(language: string) {
  return language === "en" ? en : ptBR;
}

// Template inline error strip: one line of message plus a retry that calls
// `reset()`, replacing the previous stacked destructive `Alert`. Text uses
// the AA-safe `-on-soft` pairing (never `text-danger` over `bg-danger-soft`).
export default function AdminError({ error, reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const language = useSyncExternalStore(() => () => undefined, () => document.documentElement.lang, () => "pt-BR");
  const dictionary = getAdminErrorDictionary(language);

  useEffect(() => {
    console.error("Protected administrator surface failed to render", error.digest ?? "no-digest");
  }, [error.digest]);

  return (
    <div
      className="border-danger/40 bg-danger-soft text-danger-on-soft rounded-card flex flex-wrap items-center justify-between gap-3 border px-4 py-3 text-sm"
      role="alert"
    >
      <span className="flex items-center gap-2">
        <AlertCircleIcon aria-hidden className="size-4" />
        {dictionary.adminDashboardCouldNotLoad}
      </span>
      <Button onClick={reset} size="sm" type="button" variant="outline">
        {dictionary.adminDashboardRetry}
      </Button>
    </div>
  );
}
