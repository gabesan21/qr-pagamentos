import type { CSSProperties } from "react";

import { cookies } from "next/headers";
import Link from "next/link";

import { getAuthorizationService } from "@/auth/authorization";
import { BrandIdentity } from "@/brand/brand-identity";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocalePreferenceService } from "@/i18n/locale-preference";
import { defaultLocale } from "@/i18n/locales";
import { getPublicStorefrontService } from "@/storefront/public-storefront";

export const dynamic = "force-dynamic";

export default async function PublicStorefrontPage({ params }: Readonly<{ params: Promise<{ slug: string }> }>) {
  const token = (await cookies()).get("qr_session")?.value;
  const principal = token ? await getAuthorizationService().resolve(token) : null;
  const locale = principal ? await getLocalePreferenceService().resolve(principal.id) : defaultLocale;
  const dictionary = getDictionary(locale);
  const storefront = await getPublicStorefrontService().read((await params).slug, locale);

  if (!storefront) {
    return (
      <main className="storefront-shell storefront-shell--unavailable">
        <Card className="storefront-card">
          <CardHeader><CardTitle>{dictionary.storefrontUnavailableHeading}</CardTitle></CardHeader>
          <CardContent><Alert variant="destructive"><AlertTitle>{dictionary.storefrontUnavailableHeading}</AlertTitle><AlertDescription>{dictionary.storefrontUnavailableDescription}</AlertDescription></Alert></CardContent>
        </Card>
      </main>
    );
  }

  const displayName = storefront.displayName ?? dictionary.storefrontFallbackName;
  return (
    <main className="storefront-shell" style={{ "--storefront-accent": storefront.accentColor } as CSSProperties}>
      <header className="receipt-rail storefront-rail">
        <BrandIdentity variant="merchant-fallback" />
        <h1 className="storefront-heading">{displayName}</h1>
        <p className="storefront-introduction">{dictionary.storefrontIntroduction}</p>
      </header>
      {storefront.products.length === 0 ? (
        <Card className="storefront-card">
          <CardHeader><CardTitle>{dictionary.storefrontEmptyHeading}</CardTitle><CardDescription>{dictionary.storefrontEmptyDescription}</CardDescription></CardHeader>
        </Card>
      ) : (
        <section aria-label={dictionary.storefrontProductsHeading} className="storefront-products">
          <h2 className="storefront-products__heading">{dictionary.storefrontProductsHeading}</h2>
          <div className="storefront-products__list">
            {storefront.products.map((product) => (
              <Card className="storefront-card" key={product.paymentLinkIdentifier}>
                <CardHeader><CardTitle>{product.title}</CardTitle><CardDescription className="storefront-product-description">{product.description}</CardDescription></CardHeader>
                <CardContent><p className="storefront-price"><span>{dictionary.storefrontPriceLabel}</span> {product.price}</p></CardContent>
                <CardFooter><Button asChild><Link href={`/pay/${product.paymentLinkIdentifier}`}>{dictionary.storefrontViewProduct}</Link></Button></CardFooter>
              </Card>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
