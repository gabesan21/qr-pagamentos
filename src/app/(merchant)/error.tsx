"use client";

import { useEffect, useSyncExternalStore } from "react";
import { AlertCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { en } from "@/i18n/dictionaries/en";
import { ptBR } from "@/i18n/dictionaries/pt-BR";

export function getMerchantDashboardErrorDictionary(language: string) {
  return language === "en" ? en : ptBR;
}

// Template inline error strip (14.5.1, mirroring `src/app/admin/error.tsx`):
// one line of message plus a retry that calls `reset()`. A "stale" strip has
// no producer on this server-rendered route — there is no client-held
// previous view to fall back to — so this boundary only ever renders the
// full failure state, never a stale variant; that gap is recorded in the
// task's execution report. Text uses the AA-safe `-on-soft` pairing (never
// `text-danger` over `bg-danger-soft`).
export default function MerchantDashboardError({ error, reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const language = useSyncExternalStore(() => () => undefined, () => document.documentElement.lang, () => "pt-BR");
  const dictionary = getMerchantDashboardErrorDictionary(language);

  useEffect(() => {
    console.error("Merchant dashboard failed to render", error.digest ?? "no-digest");
  }, [error.digest]);

  return (
    <div
      className="border-danger/40 bg-danger-soft text-danger-on-soft rounded-card flex flex-wrap items-center justify-between gap-3 border px-4 py-3 text-sm"
      role="alert"
    >
      <span className="flex items-center gap-2">
        <AlertCircleIcon aria-hidden className="size-4" />
        {dictionary.merchantDashboardCouldNotLoad}
      </span>
      <Button onClick={reset} size="sm" type="button" variant="outline">
        {dictionary.merchantDashboardRetry}
      </Button>
    </div>
  );
}
