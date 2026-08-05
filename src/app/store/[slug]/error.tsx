"use client";

import { useEffect, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { storefrontEn } from "@/i18n/dictionaries/storefront/en";
import { storefrontPtBR } from "@/i18n/dictionaries/storefront/pt-BR";

// One opaque localized failure for the sessionless storefront: the route error
// boundary echoes no digest or detail, and the only recovery is a render retry.
export default function PublicStorefrontError({ error, reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const language = useSyncExternalStore(() => () => undefined, () => document.documentElement.lang, () => "pt-BR");
  const dictionary = language === "en" ? storefrontEn : storefrontPtBR;

  useEffect(() => {
    console.error("Public storefront failed to render", error.digest ?? "no-digest");
  }, [error.digest]);

  return (
    <main className="storefront-shell storefront-shell--unavailable">
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
    </main>
  );
}
