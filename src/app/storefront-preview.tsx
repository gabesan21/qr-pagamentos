import type { CSSProperties } from "react";

import { BrandIdentity } from "@/brand/brand-identity";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type StorefrontPreviewProps = Readonly<{
  accentColor: string | null;
  displayName: string;
  fallbackAlt: string;
  heading: string;
  layout: string;
  logoAlt: string;
  logoMediaIdentifier: string | null;
  priceLabel: string;
  productsHeading: string;
  sampleAction: string;
  sampleDescription: string;
  samplePrice: string;
  sampleTitle: string;
  themeId: string;
}>;

// Miniature storefront mock driven by the workspace controls: the scoped
// data-theme-preview selector recolors semantic tokens without touching the
// page theme, sample copy is fixture text, and the sample action is an inert
// owned-Button composition so the preview adds no tab stop.
export function StorefrontPreview({
  accentColor,
  displayName,
  fallbackAlt,
  heading,
  layout,
  logoAlt,
  logoMediaIdentifier,
  priceLabel,
  productsHeading,
  sampleAction,
  sampleDescription,
  samplePrice,
  sampleTitle,
  themeId,
}: StorefrontPreviewProps) {
  const action = <Button asChild><span>{sampleAction}</span></Button>;
  return (
    <div className="storefront-preview-block">
      <h3 className="storefront-preview__heading" id="storefront-preview-heading">{heading}</h3>
      <section
        aria-labelledby="storefront-preview-heading"
        className="storefront-preview"
        data-layout={layout}
        data-theme-preview={themeId}
        style={{ "--storefront-accent": accentColor } as CSSProperties}
      >
        <header className="storefront-preview__rail">
          {logoMediaIdentifier
            ? <img alt={logoAlt} className="storefront-preview__logo" src={`/media/${logoMediaIdentifier}`} />
            : <span aria-label={fallbackAlt} role="img"><BrandIdentity variant="merchant-fallback" /></span>}
          <p className="storefront-preview__name">{displayName}</p>
        </header>
        {layout === "table" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{productsHeading}</TableHead>
                <TableHead>{priceLabel}</TableHead>
                <TableHead><span className="sr-only">{sampleAction}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>
                  <p className="storefront-preview__product">{sampleTitle}</p>
                  <p className="storefront-preview__description">{sampleDescription}</p>
                </TableCell>
                <TableCell className="storefront-preview__price">{samplePrice}</TableCell>
                <TableCell>{action}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        ) : (
          <Card className="storefront-preview__card">
            <CardHeader><CardTitle>{sampleTitle}</CardTitle><CardDescription>{sampleDescription}</CardDescription></CardHeader>
            <CardContent><p className="storefront-preview__price"><span>{priceLabel}</span> {samplePrice}</p></CardContent>
            <CardFooter>{action}</CardFooter>
          </Card>
        )}
      </section>
    </div>
  );
}
