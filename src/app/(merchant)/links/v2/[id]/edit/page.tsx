import Link from "next/link";

import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getPaymentLinkService } from "@/auth/payment-link";
import { getPaymentLinkV2PrefillService } from "@/auth/payment-link-v2-prefill";
import { getPaymentLinkV2ViewService } from "@/auth/payment-link-v2-view";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GitBranchIcon } from "lucide-react";

import { requireMerchantShellContext } from "../../../../shell-context";
import { LINKS_NOTICE_KEY, parseLinksNotice, type LinksSearchParams } from "../../../directory-query";
import { linkV2FormCopy } from "../../../link-v2-form-copy";
import { LinkV2Form } from "../../../link-v2-form";
import type { LinkLineValue } from "../../../link-lines-editor";
import { linkKindLabel, linkTypeLabel, PaymentLinkV2UnavailableCard } from "../../../link-v2-views";
import { PaymentLinkV2Notice } from "../../../links-notices";

function expiryInputValue(expiresAt: Date | null) {
  return expiresAt === null ? "" : expiresAt.toISOString().slice(0, 16);
}

export default async function EditPaymentLinkPage({
  params,
  searchParams = Promise.resolve({}),
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams?: Promise<LinksSearchParams>;
}>) {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const id = (await params).id;
  const notice = parseLinksNotice((await searchParams)[LINKS_NOTICE_KEY]);
  const [view, prefill, data] = await Promise.all([
    getPaymentLinkV2ViewService().getForOwner(principal, id),
    getPaymentLinkV2PrefillService().getForOwner(principal, id),
    getPaymentLinkService().listForOwner(principal),
  ]);

  if (view.kind !== "found" || prefill === null) {
    return (
      <>
        <WorkspaceHeading description={dictionary.paymentLinkDirectoryDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.shellLinks} />
        <PaymentLinkV2UnavailableCard backHref="/links" dictionary={dictionary} />
      </>
    );
  }

  const { link } = view;
  const initialLines: readonly LinkLineValue[] = link.lines.flatMap((line, index) => {
    const productId = prefill.lineProductIds[index];
    return productId === undefined ? [] : [{ productId, quantity: line.quantity }];
  });
  const products = data.activeProducts.map((product) => ({ id: product.id, titlePtBr: product.titlePtBr, titleEn: product.titleEn }));

  return (
    <div className="space-y-4">
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <Link className="inline-flex min-h-11 items-center text-foreground underline-offset-4 hover:underline" href="/links">{dictionary.shellLinks}</Link>
        <span aria-hidden>›</span>
        <Link className="inline-flex min-h-11 items-center font-mono text-foreground underline-offset-4 hover:underline" href={`/links/v2/${link.id}`}>#{link.identifier}</Link>
        <span aria-hidden>›</span>
        <span className="text-foreground">{dictionary.paymentLinkEditTitle}</span>
      </nav>

      <WorkspaceHeading description={dictionary.paymentLinkEditDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.paymentLinkEditTitle} />

      {notice ? <PaymentLinkV2Notice dictionary={dictionary} notice={notice} /> : null}

      <Alert variant="warning">
        <AlertTitle>{dictionary.paymentLinkLockTitle}</AlertTitle>
        <AlertDescription>{dictionary.paymentLinkLockDescription}</AlertDescription>
      </Alert>

      <Alert variant="default">
        <GitBranchIcon aria-hidden className="size-4" />
        <AlertTitle>{dictionary.paymentLinkNewVersion}</AlertTitle>
        <AlertDescription>{dictionary.paymentLinkNewVersionDescription}</AlertDescription>
        <div className="mt-3">
          <Button asChild data-ds-hit-target variant="outline">
            <Link href={`/links/new?from=${link.id}`}>{dictionary.paymentLinkNewVersion}</Link>
          </Button>
        </div>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>{dictionary.paymentLinkEditTitle}</CardTitle>
          <CardDescription>
            {linkKindLabel(dictionary, link.compositionKind)} · {linkTypeLabel(dictionary, link.linkType)} · {link.currencyPairLabel}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LinkV2Form
            action={`/payment-links-v2/${link.id}`}
            copy={linkV2FormCopy(dictionary, dictionary.paymentLinkEditSubmit)}
            formId="payment-link-v2-edit"
            initialExpiresAt={expiryInputValue(link.expiresAt)}
            initialKind={link.compositionKind}
            {...(link.compositionKind === "PRODUCT_LINES" ? { initialLines } : {
              initialAmount: link.amount ?? "",
              initialDescriptionEn: link.descriptionEn ?? "",
              initialDescriptionPtBr: link.descriptionPtBr ?? "",
            })}
            locale={locale}
            mode="edit"
            pairs={[]}
            products={products}
            version={prefill.version}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button asChild data-ds-hit-target variant="outline">
          <Link href={`/links/v2/${link.id}`}>{dictionary.paymentLinkBackToDetail}</Link>
        </Button>
      </div>
    </div>
  );
}
