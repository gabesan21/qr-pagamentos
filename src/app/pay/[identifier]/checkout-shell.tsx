import type { CSSProperties, ReactNode } from "react";

import { BrandIdentity } from "@/brand/brand-identity";
import { Monogram } from "@/components/ui/monogram";
import type { PublicCheckoutV2Branding } from "@/checkout/public-checkout-v2-presentation";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

import { CheckoutFooter } from "./checkout-footer";

type Dictionary = ReturnType<typeof getDictionary>;

export type CheckoutShellVariant = "checkout" | "storefront";

function MerchantIdentity({ branding, dictionary }: Readonly<{ branding: PublicCheckoutV2Branding; dictionary: Dictionary }>) {
  if (branding.logoMediaIdentifier) {
    return (
      <div className="overflow-hidden rounded-full bg-accent p-1.5">
        {/* The owner-activated public media object renders directly; the
            official merchant fallback stays the only placeholder identity. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={dictionary.checkoutMerchantLogoAlt} className="size-12 rounded-full object-cover" src={`/media/${branding.logoMediaIdentifier}`} />
      </div>
    );
  }
  if (branding.displayName) return <Monogram name={branding.displayName} size="xl" />;
  return <span aria-label={dictionary.checkoutMerchantFallbackAlt} role="img"><BrandIdentity variant="merchant-fallback" /></span>;
}

function CheckoutMerchantHeader({ branding, dictionary, variant }: Readonly<{ branding: PublicCheckoutV2Branding; dictionary: Dictionary; variant: CheckoutShellVariant }>) {
  const displayName = branding.displayName ?? dictionary.storefrontFallbackName;
  if (variant === "storefront") {
    return (
      <header className="flex items-center gap-4 rounded-card border border-border bg-surface p-6 text-left">
        <div className="shrink-0">
          <MerchantIdentity branding={branding} dictionary={dictionary} />
        </div>
        <div className="grid min-w-0 gap-1">
          <h1 className="font-display text-2xl font-semibold leading-8 break-words">{displayName}</h1>
          <p className="text-sm text-text-2">{dictionary.checkoutTrustLine}</p>
        </div>
      </header>
    );
  }
  return (
    <header className="flex flex-col items-center gap-2 text-center">
      <MerchantIdentity branding={branding} dictionary={dictionary} />
      <h1 className="font-display text-lg font-semibold leading-7">{displayName}</h1>
      <p className="text-xs text-text-2">{dictionary.checkoutTrustLine}</p>
    </header>
  );
}

// The one shared branded checkout shell (14.6.1 F01): a single column capped
// at the checkout token (or, for the `storefront` variant used only by the
// catalog page, the app shell width), the merchant header, and the public
// footer — composed by the V2 checkout/paid branches, the unavailable view,
// `loading`, and `error`. `branding` is optional: the
// opaque unavailable/loading/error views render no merchant identity, only
// the column and the footer. This is the only file declaring
// `--storefront-accent` — `scripts/check-design-tokens.mjs` allows exactly
// this one path.
export function CheckoutShell({ branding, busy, children, dictionary, hidePrivacyStatement = false, locale, variant = "checkout" }: Readonly<{ branding?: PublicCheckoutV2Branding; busy?: boolean; children: ReactNode; dictionary: Dictionary; hidePrivacyStatement?: boolean; locale: SupportedLocale; variant?: CheckoutShellVariant }>) {
  const width = variant === "storefront" ? "max-w-app" : "max-w-checkout";
  return (
    <main
      aria-busy={busy}
      className="flex min-h-dvh w-full flex-col items-center bg-bg px-4 py-8 text-text"
      data-theme-preview={branding?.themeId}
      style={branding ? ({ "--storefront-accent": branding.accentColor } as CSSProperties) : undefined}
    >
      <div className={`flex w-full ${width} flex-1 flex-col gap-6`}>
        {branding ? <CheckoutMerchantHeader branding={branding} dictionary={dictionary} variant={variant} /> : null}
        {children}
      </div>
      <div className={`mt-8 w-full ${width}`}>
        <CheckoutFooter dictionary={dictionary} hidePrivacyStatement={hidePrivacyStatement} locale={locale} />
      </div>
    </main>
  );
}
