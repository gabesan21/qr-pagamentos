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
// owned-Button composition so the preview adds no tab stop. Design-vocabulary
// utilities only (14.5.3 F02): the retired `.storefront-preview*` BEM block
// is removed with F04, so this component stops referencing it now.
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
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground" id="storefront-preview-heading">{heading}</h3>
      <section
        aria-labelledby="storefront-preview-heading"
        className="grid gap-5 rounded-lg border border-border bg-card p-5 text-card-foreground"
        data-layout={layout}
        data-theme-preview={themeId}
        style={{ "--storefront-accent": accentColor } as CSSProperties}
      >
        <header className="flex flex-wrap items-center gap-3 border-b-2 border-[color:var(--storefront-accent,var(--action-primary))] py-3">
          {logoMediaIdentifier
            ? <img alt={logoAlt} className="size-8 object-contain" src={`/media/${logoMediaIdentifier}`} />
            : <span aria-label={fallbackAlt} role="img"><BrandIdentity variant="merchant-fallback" /></span>}
          <p className="truncate text-lg font-semibold leading-tight text-foreground">{displayName}</p>
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
                  <p className="font-medium text-foreground">{sampleTitle}</p>
                  <p className="text-sm text-muted-foreground">{sampleDescription}</p>
                </TableCell>
                <TableCell className="tabular-nums">{samplePrice}</TableCell>
                <TableCell>{action}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        ) : (
          <Card>
            <CardHeader><CardTitle>{sampleTitle}</CardTitle><CardDescription>{sampleDescription}</CardDescription></CardHeader>
            <CardContent><p className="tabular-nums"><span className="text-sm font-medium text-muted-foreground">{priceLabel}</span> {samplePrice}</p></CardContent>
            <CardFooter>{action}</CardFooter>
          </Card>
        )}
      </section>
    </div>
  );
}
