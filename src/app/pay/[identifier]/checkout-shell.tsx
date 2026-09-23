import type { CSSProperties, ReactNode } from "react";

import { BrandIdentity } from "@/brand/brand-identity";
import { Monogram } from "@/components/ui/monogram";
import type { PublicCheckoutV2Branding } from "@/checkout/public-checkout-v2-presentation";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

import { CheckoutFooter } from "./checkout-footer";

type Dictionary = ReturnType<typeof getDictionary>;

function CheckoutMerchantHeader({ branding, dictionary }: Readonly<{ branding: PublicCheckoutV2Branding; dictionary: Dictionary }>) {
  const displayName = branding.displayName ?? dictionary.storefrontFallbackName;
  return (
    <header className="flex flex-col items-center gap-2 text-center">
      {branding.logoMediaIdentifier ? (
        <div className="rounded-full bg-accent p-1.5">
          {/* The owner-activated public media object renders directly; the
              official merchant fallback stays the only placeholder identity. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={dictionary.checkoutMerchantLogoAlt} className="size-12 object-contain" src={`/media/${branding.logoMediaIdentifier}`} />
        </div>
      ) : branding.displayName ? (
        <Monogram name={branding.displayName} size="xl" />
      ) : (
        <span aria-label={dictionary.checkoutMerchantFallbackAlt} role="img"><BrandIdentity variant="merchant-fallback" /></span>
      )}
      <h1 className="font-display text-lg font-semibold leading-7">{displayName}</h1>
      <p className="text-xs text-text-2">{dictionary.checkoutTrustLine}</p>
    </header>
  );
}

// The one shared branded checkout shell (14.6.1 F01): a single column capped
// at the checkout token, the merchant header, and the public footer —
// composed by the V2 checkout/paid branches, the unavailable view, `loading`,
// and `error`. `branding` is optional: the
// opaque unavailable/loading/error views render no merchant identity, only
// the column and the footer. This is the only file declaring
// `--storefront-accent` — `scripts/check-design-tokens.mjs` allows exactly
// this one path.
export function CheckoutShell({ branding, busy, children, dictionary, locale }: Readonly<{ branding?: PublicCheckoutV2Branding; busy?: boolean; children: ReactNode; dictionary: Dictionary; locale: SupportedLocale }>) {
  return (
    <main
      aria-busy={busy}
      className="flex min-h-dvh w-full flex-col items-center bg-bg px-4 py-8 text-text"
      data-theme-preview={branding?.themeId}
      style={branding ? ({ "--storefront-accent": branding.accentColor } as CSSProperties) : undefined}
    >
      <div className="flex w-full max-w-checkout flex-1 flex-col gap-6">
        {branding ? <CheckoutMerchantHeader branding={branding} dictionary={dictionary} /> : null}
        {children}
      </div>
      <div className="mt-8 w-full max-w-checkout">
        <CheckoutFooter dictionary={dictionary} locale={locale} />
      </div>
    </main>
  );
}
